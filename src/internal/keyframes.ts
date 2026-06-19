/**
 * Converts styled-components keyframes into StyleX keyframes objects.
 * Core concepts: Stylis parsing and keyframes extraction.
 */
import type { ASTNode, ASTPath, Collection, ImportDeclaration, JSCodeshift } from "jscodeshift";
import { compile } from "stylis";
import type { CssRuleIR } from "./css-ir.js";
import { cssDeclarationToStylexDeclarations } from "./css-prop-mapping.js";
import { classifyAnimationTokens, parseAnimationSegments } from "./lower-rules/animation.js";
import { cloneAstNode, literalToStaticValue } from "./utilities/jscodeshift-utils.js";

export function convertStyledKeyframes(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
  keyframesLocal: string;
  objectToAst: (j: JSCodeshift, value: Record<string, unknown>) => ExpressionKind;
  preserveNames?: Set<string>;
  duplicateNames?: Map<string, string>;
}): { keyframesNames: Set<string>; changed: boolean } {
  return convertStyledKeyframesImpl(args);
}

export function collectStyledKeyframeNames(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  keyframesLocal: string;
}): Set<string> {
  return new Set(collectStyledKeyframeDefinitions(args).map((definition) => definition.localName));
}

export const GENERATED_STYLEX_KEYFRAMES_ALIAS_COMMENT =
  "@styled-components-to-stylex generated keyframes alias";

type StyledKeyframesDefinition = {
  declaratorPath: ASTPath<ASTNode>;
  localName: string;
  frames: Record<string, Record<string, unknown>>;
};

function parseKeyframesTemplate(args: {
  template: ASTNode | null | undefined;
  j: JSCodeshift;
  scopePath: ASTPath<ASTNode>;
}): Record<string, Record<string, unknown>> | null {
  const { template, j, scopePath } = args;
  if (!template || template.type !== "TemplateLiteral") {
    return null;
  }
  const slotExprById = new Map<number, ExpressionKind>();
  for (let i = 0; i < (template.expressions?.length ?? 0); i++) {
    const expr = template.expressions[i];
    if (!expr) {
      return null;
    }
    if (!isStaticSafeKeyframesSlotExpression(expr as ExpressionKind, scopePath)) {
      return null;
    }
    slotExprById.set(i, expr as ExpressionKind);
  }
  const rawCss = (template.quasis ?? [])
    .map((q: any, i: number) => {
      const raw = q.value?.raw ?? "";
      return i < (template.expressions?.length ?? 0) ? `${raw}__SC_EXPR_${i}__` : raw;
    })
    .join("");
  const wrapped = `@keyframes __SC_KEYFRAMES__ { ${rawCss} }`;
  const ast = compile(wrapped) as any[];

  const frames: Record<string, Record<string, unknown>> = {};
  let failed = false;
  const visit = (node: any): void => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      for (const c of node) {
        visit(c);
      }
      return;
    }
    if (typeof node.type === "string" && node.type === "@keyframes") {
      visit(node.children);
      return;
    }
    if (node.type === "rule") {
      const frameKey = resolveKeyframeSelectorPlaceholders(
        String(node.value ?? "").trim(),
        slotExprById,
        scopePath,
      );
      if (frameKey === null) {
        failed = true;
        return;
      }
      const styleObj: Record<string, unknown> = {};
      const children: any[] = Array.isArray(node.children)
        ? node.children
        : node.children
          ? [node.children]
          : [];

      for (const c of children) {
        if (!c || c.type !== "decl") {
          continue;
        }
        // Stylis keyframes decl nodes use:
        // - `props`: property name (string)
        // - `children`: value (string)
        // (Older stylis formats may also include `value` as `prop:value;`.)
        const propRaw =
          typeof c.props === "string" && c.props
            ? c.props
            : typeof c.value === "string" && c.value.includes(":")
              ? (c.value.split(":")[0] ?? "").trim()
              : "";
        const valueRaw =
          typeof c.children === "string"
            ? c.children.trim()
            : typeof c.value === "string" && c.value.includes(":")
              ? c.value.split(":").slice(1).join(":").replace(/;$/, "").trim()
              : "";
        if (!propRaw) {
          continue;
        }
        const raw = propRaw.trim();
        applyStaticDeclsToStyleObj(styleObj, raw, valueRaw, { j, slotExprById });
      }

      frames[frameKey] = styleObj;
      return;
    }
    visit(node.children);
  };
  visit(ast);
  return !failed && Object.keys(frames).length ? frames : null;
}

function convertStyledKeyframesImpl(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
  keyframesLocal: string;
  objectToAst: (j: JSCodeshift, value: Record<string, unknown>) => ExpressionKind;
  preserveNames?: Set<string>;
  duplicateNames?: Map<string, string>;
}): { keyframesNames: Set<string>; changed: boolean } {
  const { root, j, styledImports, keyframesLocal, objectToAst, preserveNames, duplicateNames } =
    args;

  const keyframesNames = new Set<string>();
  let changed = false;
  let hasPreservedKeyframesDefinition = false;

  for (const definition of collectStyledKeyframeDefinitions({ root, j, keyframesLocal })) {
    if (preserveNames?.has(definition.localName)) {
      const duplicateName = duplicateNames?.get(definition.localName);
      if (duplicateName) {
        insertStylexKeyframesDeclaration({
          root,
          j,
          afterDeclaratorPath: definition.declaratorPath,
          localName: duplicateName,
          init: j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
            [objectToAst(j, definition.frames)],
          ),
        });
        keyframesNames.add(duplicateName);
        changed = true;
      } else {
        keyframesNames.add(definition.localName);
      }
      hasPreservedKeyframesDefinition = true;
      continue;
    }

    const declarator = definition.declaratorPath.node;
    if (declarator.type !== "VariableDeclarator") {
      continue;
    }

    declarator.init = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
      [objectToAst(j, definition.frames)],
    );
    keyframesNames.add(definition.localName);
    changed = true;
  }

  const hasUnconvertedKeyframesDefinition = hasStyledKeyframesTemplate({
    root,
    j,
    keyframesLocal,
  });

  if (!hasPreservedKeyframesDefinition && !hasUnconvertedKeyframesDefinition) {
    // Remove `keyframes` import specifier (now handled by stylex).
    styledImports.forEach((imp) => {
      const specs = imp.node.specifiers ?? [];
      const next = specs.filter((s) => {
        if (s.type !== "ImportSpecifier") {
          return true;
        }
        if (s.imported.type !== "Identifier") {
          return true;
        }
        return s.imported.name !== "keyframes";
      });
      if (next.length !== specs.length) {
        imp.node.specifiers = next;
        if (imp.node.specifiers.length === 0) {
          j(imp).remove();
        }
        changed = true;
      }
    });
  }

  return { keyframesNames, changed };
}

function hasStyledKeyframesTemplate(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  keyframesLocal: string;
}): boolean {
  const { root, j, keyframesLocal } = args;
  let hasTemplate = false;
  root
    .find(j.TaggedTemplateExpression, {
      tag: { type: "Identifier", name: keyframesLocal },
    } as any)
    .forEach(() => {
      hasTemplate = true;
    });
  return hasTemplate;
}

function insertStylexKeyframesDeclaration(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  afterDeclaratorPath: ASTPath<ASTNode>;
  localName: string;
  init: ExpressionKind;
}): void {
  const { root, j, afterDeclaratorPath, localName, init } = args;
  const declaration = j.variableDeclaration("const", [
    j.variableDeclarator(j.identifier(localName), init),
  ]);
  const provenanceComment = j.commentBlock(` ${GENERATED_STYLEX_KEYFRAMES_ALIAS_COMMENT} `);
  (declaration as ASTNode & { comments?: unknown[]; leadingComments?: unknown[] }).comments = [
    provenanceComment,
  ];
  (declaration as ASTNode & { comments?: unknown[]; leadingComments?: unknown[] }).leadingComments =
    [provenanceComment];
  const targetDeclarator = afterDeclaratorPath.node;
  const owner = findStatementListOwningDeclarator(root, targetDeclarator);
  if (!owner) {
    return;
  }
  const { statements, insertionIndex } = owner;
  statements.splice(insertionIndex + 1, 0, declaration);
}

function findStatementListOwningDeclarator(
  root: Collection<ASTNode>,
  targetDeclarator: ASTNode,
): { statements: ASTNode[]; insertionIndex: number } | null {
  let owner: { statements: ASTNode[]; insertionIndex: number } | null = null;

  const visit = (node: unknown): void => {
    if (owner || !node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    const statements = getStatementList(node);
    if (statements) {
      const insertionIndex = statements.findIndex((statement) =>
        statementOwnsDeclarator(statement, targetDeclarator),
      );
      if (insertionIndex >= 0) {
        owner = { statements, insertionIndex };
        return;
      }
    }
    for (const key of Object.keys(node as Record<string, unknown>)) {
      if (key === "loc" || key === "comments" || key === "leadingComments") {
        continue;
      }
      visit((node as Record<string, unknown>)[key]);
    }
  };

  visit(root.get().node.program);
  return owner;
}

function getStatementList(node: unknown): ASTNode[] | null {
  if (!node || typeof node !== "object" || !("type" in node)) {
    return null;
  }
  const typed = node as {
    type?: string;
    body?: unknown;
    consequent?: unknown;
    alternate?: unknown;
  };
  if (
    (typed.type === "Program" ||
      typed.type === "BlockStatement" ||
      typed.type === "TSModuleBlock") &&
    Array.isArray(typed.body)
  ) {
    return typed.body as ASTNode[];
  }
  if (typed.type === "SwitchCase" && Array.isArray(typed.consequent)) {
    return typed.consequent as ASTNode[];
  }
  return null;
}

function statementOwnsDeclarator(statement: ASTNode, declarator: ASTNode): boolean {
  const declaration =
    statement.type === "ExportNamedDeclaration" &&
    statement.declaration?.type === "VariableDeclaration"
      ? statement.declaration
      : statement.type === "VariableDeclaration"
        ? statement
        : null;
  if (!declaration) {
    return false;
  }
  return declaration.declarations.some((candidate) => candidate === declarator);
}

function collectStyledKeyframeDefinitions(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  keyframesLocal: string;
}): StyledKeyframesDefinition[] {
  const { root, j, keyframesLocal } = args;
  const definitions: StyledKeyframesDefinition[] = [];

  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((p) => {
      const init = p.node.init as ASTNode | null | undefined;
      if (
        !init ||
        init.type !== "TaggedTemplateExpression" ||
        init.tag?.type !== "Identifier" ||
        init.tag.name !== keyframesLocal
      ) {
        return;
      }
      if (p.node.id.type !== "Identifier") {
        return;
      }
      const localName = p.node.id.name;
      const template = init?.quasi;
      const frames = parseKeyframesTemplate({ template, j, scopePath: p as ASTPath<ASTNode> });
      if (!frames) {
        return;
      }

      definitions.push({
        declaratorPath: p as ASTPath<ASTNode>,
        localName,
        frames,
      });
    });

  return definitions;
}

/**
 * Converts a CSS @keyframes name to a valid JS identifier.
 * E.g. "fade-in" → "fadeIn", "2bounce" → "_2bounce".
 */
export function cssKeyframeNameToIdentifier(name: string): string {
  // Convert kebab-case to camelCase
  let result = name.replace(/-([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
  // Replace any remaining invalid characters with underscores
  result = result.replace(/[^a-zA-Z0-9_$]/g, "_");
  // Ensure it doesn't start with a digit
  if (/^\d/.test(result)) {
    result = `_${result}`;
  }
  return result;
}

/**
 * Extracts inline @keyframes definitions from CSS IR rules.
 * Returns a map of keyframe name → frame objects (e.g., { "0%": { opacity: 0 }, "100%": { opacity: 1 } }).
 */
export function extractInlineKeyframes(
  rules: CssRuleIR[],
): Map<string, Record<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, Record<string, unknown>>>();

  for (const rule of rules) {
    const kfAtRule = rule.atRuleStack.find((at) => at.startsWith("@keyframes "));
    if (!kfAtRule) {
      continue;
    }
    const kfName = kfAtRule.replace("@keyframes ", "").trim();
    if (!kfName) {
      continue;
    }

    let frames = result.get(kfName);
    if (!frames) {
      frames = {};
      result.set(kfName, frames);
    }

    // If any declaration inside this keyframe is non-static (interpolated),
    // we cannot safely represent it in stylex.keyframes(). Skip this entire
    // keyframe so the bail logic in process-rules catches it.
    if (rule.declarations.some((d) => d.value.kind !== "static")) {
      result.delete(kfName);
      continue;
    }

    const frameKey = rule.selector.trim();
    const styleObj: Record<string, unknown> = frames[frameKey] ?? {};
    for (const d of rule.declarations) {
      applyStaticDeclsToStyleObj(styleObj, d.property, d.valueRaw);
    }
    frames[frameKey] = styleObj;
  }

  return result;
}

/**
 * Expands static CSS declarations into a style object via cssDeclarationToStylexDeclarations.
 * Handles shorthand expansion and coerces numeric strings to numbers.
 */
function applyStaticDeclsToStyleObj(
  styleObj: Record<string, unknown>,
  property: string,
  valueRaw: string,
  options?: {
    j?: JSCodeshift;
    slotExprById?: Map<number, ExpressionKind>;
  },
): void {
  for (const out of cssDeclarationToStylexDeclarations({
    property,
    value: { kind: "static", value: valueRaw },
    important: false,
    valueRaw,
  })) {
    if (out.value.kind === "static") {
      const v = out.value.value.trim();
      const exprValue = resolvePlaceholderValueToAst(v, options);
      if (exprValue) {
        styleObj[out.prop] = exprValue;
        continue;
      }
      styleObj[out.prop] = /^-?\d*\.?\d+$/.test(v) ? Number(v) : v;
    }
  }
}

function resolvePlaceholderValueToAst(
  value: string,
  options:
    | {
        j?: JSCodeshift;
        slotExprById?: Map<number, ExpressionKind>;
      }
    | null
    | undefined,
): ExpressionKind | null {
  const j = options?.j;
  const slotExprById = options?.slotExprById;
  if (!j || !slotExprById || !/__SC_EXPR_\d+__/.test(value)) {
    return null;
  }

  const placeholderRe = /__SC_EXPR_(\d+)__/g;
  const quasis: any[] = [];
  const exprs: ExpressionKind[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderRe.exec(value))) {
    const expr = slotExprById.get(Number(match[1]));
    if (!expr) {
      return null;
    }
    const prefix = value.slice(lastIndex, match.index);
    quasis.push(j.templateElement({ raw: prefix, cooked: prefix }, false));
    exprs.push(cloneAstNode(expr));
    lastIndex = match.index + match[0].length;
  }

  if (exprs.length === 0) {
    return null;
  }

  const suffix = value.slice(lastIndex);
  quasis.push(j.templateElement({ raw: suffix, cooked: suffix }, true));

  if (quasis.length === 2 && quasis[0].value.raw === "" && quasis[1].value.raw === "") {
    return exprs[0]!;
  }

  return j.templateLiteral(quasis, exprs);
}

function resolveKeyframeSelectorPlaceholders(
  frameKey: string,
  slotExprById: Map<number, ExpressionKind>,
  scopePath: ASTPath<ASTNode>,
): string | null {
  if (!/__SC_EXPR_\d+__/.test(frameKey)) {
    return frameKey;
  }

  const resolved = frameKey.replace(/__SC_EXPR_(\d+)__/g, (_placeholder, id: string) => {
    const expr = slotExprById.get(Number(id));
    if (!expr) {
      return _placeholder;
    }
    const value = evaluateStaticKeyframesExpression(expr, scopePath);
    return typeof value === "string" || typeof value === "number" ? String(value) : _placeholder;
  });
  return /__SC_EXPR_\d+__/.test(resolved) ? null : resolved;
}

function evaluateStaticKeyframesExpression(
  expr: ExpressionKind,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string> = new Set(),
): string | number | boolean | null {
  const staticValue = literalToStaticValue(expr);
  if (
    typeof staticValue === "string" ||
    typeof staticValue === "number" ||
    typeof staticValue === "boolean"
  ) {
    return staticValue;
  }

  if (expr.type === "Identifier") {
    if (seenIdentifiers.has(expr.name)) {
      return null;
    }
    seenIdentifiers.add(expr.name);
    const init = getConstIdentifierInitializer(expr.name, scopePath, new Set());
    const value = init ? evaluateStaticKeyframesExpression(init, scopePath, seenIdentifiers) : null;
    seenIdentifiers.delete(expr.name);
    return value;
  }

  if (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression") {
    const memberValue = getStaticMemberExpressionValue(expr, scopePath);
    return memberValue
      ? evaluateStaticKeyframesExpression(memberValue, scopePath, seenIdentifiers)
      : null;
  }

  if (expr.type === "UnaryExpression") {
    const value = evaluateStaticKeyframesExpression(
      expr.argument as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
    if (typeof value !== "number") {
      return null;
    }
    if (expr.operator === "-") {
      return -value;
    }
    if (expr.operator === "+") {
      return value;
    }
    return null;
  }

  if (expr.type === "BinaryExpression") {
    return evaluateStaticBinaryExpression(expr, scopePath, seenIdentifiers);
  }

  if (expr.type === "LogicalExpression") {
    const left = evaluateStaticKeyframesExpression(
      expr.left as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
    if (expr.operator === "&&") {
      return left
        ? evaluateStaticKeyframesExpression(expr.right as ExpressionKind, scopePath)
        : left;
    }
    if (expr.operator === "||") {
      return left || evaluateStaticKeyframesExpression(expr.right as ExpressionKind, scopePath);
    }
    if (expr.operator === "??") {
      return left ?? evaluateStaticKeyframesExpression(expr.right as ExpressionKind, scopePath);
    }
    return null;
  }

  if (expr.type === "ConditionalExpression") {
    const test = evaluateStaticKeyframesExpression(
      expr.test as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
    if (typeof test !== "boolean") {
      return null;
    }
    return evaluateStaticKeyframesExpression(
      (test ? expr.consequent : expr.alternate) as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  if (expr.type === "CallExpression") {
    return evaluateStaticMathCall(expr, scopePath, seenIdentifiers);
  }

  if (expr.type === "TemplateLiteral") {
    let result = "";
    for (let i = 0; i < expr.quasis.length; i++) {
      result += expr.quasis[i]?.value.cooked ?? expr.quasis[i]?.value.raw ?? "";
      const slotExpr = expr.expressions[i];
      if (!slotExpr) {
        continue;
      }
      const value = evaluateStaticKeyframesExpression(
        slotExpr as ExpressionKind,
        scopePath,
        seenIdentifiers,
      );
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        return null;
      }
      result += String(value);
    }
    return result;
  }

  if (expr.type === "ParenthesizedExpression") {
    return evaluateStaticKeyframesExpression(
      expr.expression as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  if (
    expr.type === "TSAsExpression" ||
    expr.type === "TSTypeAssertion" ||
    expr.type === "TSSatisfiesExpression"
  ) {
    return evaluateStaticKeyframesExpression(
      expr.expression as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  return null;
}

function evaluateStaticBinaryExpression(
  expr: ExpressionKind,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string>,
): string | number | null {
  if (expr.type !== "BinaryExpression") {
    return null;
  }
  const left = evaluateStaticKeyframesExpression(
    expr.left as ExpressionKind,
    scopePath,
    seenIdentifiers,
  );
  const right = evaluateStaticKeyframesExpression(
    expr.right as ExpressionKind,
    scopePath,
    seenIdentifiers,
  );
  if (left === null || right === null) {
    return null;
  }
  if (expr.operator === "+") {
    if (typeof left === "string" || typeof right === "string") {
      return String(left) + String(right);
    }
    if (typeof left === "number" && typeof right === "number") {
      return left + right;
    }
    return null;
  }
  if (typeof left !== "number" || typeof right !== "number") {
    return null;
  }
  if (expr.operator === "-") {
    return left - right;
  }
  if (expr.operator === "*") {
    return left * right;
  }
  if (expr.operator === "/") {
    return left / right;
  }
  if (expr.operator === "%") {
    return left % right;
  }
  return null;
}

function evaluateStaticMathCall(
  expr: ExpressionKind,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string>,
): number | null {
  if (expr.type !== "CallExpression") {
    return null;
  }
  const method = getSupportedMathMethod(expr.callee as ExpressionKind | undefined);
  if (!method) {
    return null;
  }
  const args: number[] = [];
  for (const arg of expr.arguments) {
    if (arg.type === "SpreadElement") {
      return null;
    }
    const value = evaluateStaticKeyframesExpression(
      arg as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
    if (typeof value !== "number") {
      return null;
    }
    args.push(value);
  }
  switch (method) {
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "round":
      return args.length === 1 ? Math.round(args[0]!) : null;
    case "floor":
      return args.length === 1 ? Math.floor(args[0]!) : null;
    case "ceil":
      return args.length === 1 ? Math.ceil(args[0]!) : null;
  }
}

function getSupportedMathMethod(
  callee: ExpressionKind | undefined,
): "min" | "max" | "round" | "floor" | "ceil" | null {
  if (
    callee?.type !== "MemberExpression" ||
    (callee.object as { type?: string; name?: string } | undefined)?.type !== "Identifier" ||
    (callee.object as { name?: string }).name !== "Math" ||
    (callee.property as { type?: string; name?: string } | undefined)?.type !== "Identifier"
  ) {
    return null;
  }
  const method = (callee.property as { name?: string }).name;
  return method === "min" ||
    method === "max" ||
    method === "round" ||
    method === "floor" ||
    method === "ceil"
    ? method
    : null;
}

function getStaticMemberExpressionValue(
  expr: ExpressionKind,
  scopePath: ASTPath<ASTNode>,
): ExpressionKind | null {
  const member = expr as {
    object?: ExpressionKind;
    property?: ExpressionKind;
    computed?: boolean;
  };
  if (!member.object || member.object.type !== "Identifier" || !member.property) {
    return null;
  }
  const propertyName = getStaticPropertyName(member.property, member.computed);
  if (!propertyName) {
    return null;
  }

  const objectInit = getConstIdentifierInitializer(member.object.name, scopePath, new Set());
  if (!objectInit || objectInit.type !== "ObjectExpression") {
    return null;
  }

  for (const property of objectInit.properties ?? []) {
    if (!property || (property.type !== "Property" && property.type !== "ObjectProperty")) {
      continue;
    }
    const keyName = getStaticPropertyName(
      property.key as ExpressionKind,
      (property as { computed?: boolean }).computed,
    );
    if (keyName === propertyName) {
      return property.value as ExpressionKind;
    }
  }

  return null;
}

function getStaticPropertyName(key: ExpressionKind, computed: boolean | undefined): string | null {
  if (!computed && key.type === "Identifier") {
    return key.name;
  }
  if (key.type === "StringLiteral" || key.type === "Literal") {
    return String(key.value);
  }
  return null;
}

function isStaticSafeKeyframesSlotExpression(
  expr: ExpressionKind,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string> = new Set(),
): boolean {
  if (isFunctionLikeExpression(expr)) {
    return false;
  }

  const staticValue = literalToStaticValue(expr);
  if (staticValue !== null) {
    return typeof staticValue === "string" || typeof staticValue === "number";
  }

  if (expr.type === "Identifier") {
    return isStaticSafeIdentifierBinding(expr.name, scopePath, seenIdentifiers);
  }

  if (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression") {
    return isStaticSafeMemberExpressionBinding(expr, scopePath, seenIdentifiers);
  }

  if (expr.type === "UnaryExpression") {
    return isStaticSafeKeyframesSlotExpression(
      expr.argument as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  if (expr.type === "BinaryExpression" || expr.type === "LogicalExpression") {
    return (
      isStaticSafeKeyframesSlotExpression(
        expr.left as ExpressionKind,
        scopePath,
        seenIdentifiers,
      ) &&
      isStaticSafeKeyframesSlotExpression(expr.right as ExpressionKind, scopePath, seenIdentifiers)
    );
  }

  if (expr.type === "ConditionalExpression") {
    return (
      isStaticSafeKeyframesSlotExpression(
        expr.test as ExpressionKind,
        scopePath,
        seenIdentifiers,
      ) &&
      isStaticSafeKeyframesSlotExpression(
        expr.consequent as ExpressionKind,
        scopePath,
        seenIdentifiers,
      ) &&
      isStaticSafeKeyframesSlotExpression(
        expr.alternate as ExpressionKind,
        scopePath,
        seenIdentifiers,
      )
    );
  }

  if (expr.type === "CallExpression") {
    const callee = expr.callee as ExpressionKind | undefined;
    const isSupportedMathCall =
      callee?.type === "MemberExpression" &&
      (callee.object as { type?: string; name?: string } | undefined)?.type === "Identifier" &&
      (callee.object as { name?: string }).name === "Math" &&
      (callee.property as { type?: string; name?: string } | undefined)?.type === "Identifier" &&
      ["min", "max", "round", "floor", "ceil"].includes(
        (callee.property as { name?: string }).name ?? "",
      );
    return (
      isSupportedMathCall &&
      expr.arguments.every(
        (arg) =>
          arg.type !== "SpreadElement" &&
          isStaticSafeKeyframesSlotExpression(arg as ExpressionKind, scopePath, seenIdentifiers),
      )
    );
  }

  if (expr.type === "TemplateLiteral") {
    return expr.expressions.every((slotExpr) =>
      isStaticSafeKeyframesSlotExpression(slotExpr as ExpressionKind, scopePath, seenIdentifiers),
    );
  }

  if (expr.type === "ParenthesizedExpression") {
    return isStaticSafeKeyframesSlotExpression(
      expr.expression as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  if (
    expr.type === "TSAsExpression" ||
    expr.type === "TSTypeAssertion" ||
    expr.type === "TSSatisfiesExpression"
  ) {
    return isStaticSafeKeyframesSlotExpression(
      expr.expression as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  return false;
}

function isFunctionLikeExpression(expr: ExpressionKind): boolean {
  return expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression";
}

function isStaticSafeIdentifierBinding(
  name: string,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string>,
): boolean {
  if (seenIdentifiers.has(name)) {
    return false;
  }
  seenIdentifiers.add(name);

  const scope = (scopePath as any).scope?.lookup?.(name);
  if (!scope || typeof scope.getBindings !== "function") {
    seenIdentifiers.delete(name);
    return false;
  }

  const bindings = scope.getBindings();
  const refs = bindings?.[name];
  if (!Array.isArray(refs) || refs.length !== 1) {
    seenIdentifiers.delete(name);
    return false;
  }

  const idPath = refs[0];
  const declarator = idPath?.parent?.value;
  if (!declarator || declarator.type !== "VariableDeclarator" || declarator.id !== idPath.value) {
    seenIdentifiers.delete(name);
    return false;
  }

  const declaration = idPath?.parent?.parent?.value;
  if (!declaration || declaration.type !== "VariableDeclaration" || declaration.kind !== "const") {
    seenIdentifiers.delete(name);
    return false;
  }

  if (!declarator.init) {
    seenIdentifiers.delete(name);
    return false;
  }

  const isStatic = isStaticSafeKeyframesSlotExpression(
    declarator.init as ExpressionKind,
    scopePath,
    seenIdentifiers,
  );
  seenIdentifiers.delete(name);
  return isStatic;
}

function isStaticSafeMemberExpressionBinding(
  expr: ExpressionKind,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string>,
): boolean {
  const member = expr as {
    object?: ExpressionKind;
    property?: ExpressionKind;
    computed?: boolean;
  };
  if (!member.object || member.object.type !== "Identifier" || !member.property) {
    return false;
  }
  const propertyName =
    !member.computed && member.property.type === "Identifier"
      ? member.property.name
      : member.computed && member.property.type === "StringLiteral"
        ? String(member.property.value)
        : member.computed && member.property.type === "Literal"
          ? String(member.property.value)
          : null;
  if (!propertyName) {
    return false;
  }

  const objectInit = getConstIdentifierInitializer(member.object.name, scopePath, seenIdentifiers);
  if (!objectInit || objectInit.type !== "ObjectExpression") {
    return false;
  }

  for (const property of objectInit.properties ?? []) {
    if (!property || (property.type !== "Property" && property.type !== "ObjectProperty")) {
      continue;
    }
    const key = property.key as { type?: string; name?: string; value?: unknown };
    const keyName =
      key.type === "Identifier"
        ? key.name
        : key.type === "StringLiteral" || key.type === "Literal"
          ? String(key.value)
          : null;
    if (keyName !== propertyName) {
      continue;
    }
    return isStaticSafeKeyframesSlotExpression(
      property.value as ExpressionKind,
      scopePath,
      seenIdentifiers,
    );
  }

  return false;
}

function getConstIdentifierInitializer(
  name: string,
  scopePath: ASTPath<ASTNode>,
  seenIdentifiers: Set<string>,
): ExpressionKind | null {
  if (seenIdentifiers.has(name)) {
    return null;
  }
  seenIdentifiers.add(name);

  const scope = (scopePath as any).scope?.lookup?.(name);
  if (!scope || typeof scope.getBindings !== "function") {
    seenIdentifiers.delete(name);
    return null;
  }

  const bindings = scope.getBindings();
  const refs = bindings?.[name];
  if (!Array.isArray(refs) || refs.length !== 1) {
    seenIdentifiers.delete(name);
    return null;
  }

  const idPath = refs[0];
  const declarator = idPath?.parent?.value;
  const declaration = idPath?.parent?.parent?.value;
  const init =
    declarator &&
    declarator.type === "VariableDeclarator" &&
    declarator.id === idPath.value &&
    declaration?.type === "VariableDeclaration" &&
    declaration.kind === "const"
      ? ((declarator.init as ExpressionKind | null | undefined) ?? null)
      : null;
  seenIdentifiers.delete(name);
  return init;
}

/**
 * Expands a static `animation` shorthand value into longhand properties,
 * replacing the animation name with a keyframes identifier when it matches
 * an inline keyframe.
 */
export function expandStaticAnimationShorthand(
  value: string,
  inlineKeyframeNames: Set<string>,
  j: JSCodeshift,
  styleObj: Record<string, unknown>,
  nameMap?: Map<string, string>,
): boolean {
  // Use postcss-value-parser to properly handle function tokens like
  // cubic-bezier(0.1, 0.7, 1, 0.1) and steps(4, end) without splitting them.
  const segments = parseAnimationSegments(value);
  if (segments.length === 0) {
    return false;
  }
  const names: string[] = [];
  const durations: Array<string | null> = [];
  const delays: Array<string | null> = [];
  const timings: Array<string | null> = [];
  const directions: Array<string | null> = [];
  const fillModes: Array<string | null> = [];
  const playStates: Array<string | null> = [];
  const iterations: Array<string | null> = [];

  for (const tokens of segments) {
    const nameIdx = tokens.findIndex((t) => inlineKeyframeNames.has(t));
    if (nameIdx < 0) {
      return false;
    }
    const cssName = tokens[nameIdx]!;
    names.push(nameMap?.get(cssName) ?? cssKeyframeNameToIdentifier(cssName));
    const remaining = tokens.filter((_, i) => i !== nameIdx);
    const classified = classifyAnimationTokens(remaining);
    if (!classified) {
      return false;
    }
    durations.push(classified.duration);
    delays.push(classified.delay);
    timings.push(classified.timing);
    directions.push(classified.direction);
    fillModes.push(classified.fillMode);
    playStates.push(classified.playState);
    iterations.push(classified.iteration);
  }

  styleObj.animationName =
    names.length === 1 ? j.identifier(names[0]!) : buildAnimationNameTemplate(j, names);

  assignAnimationLonghand(styleObj, "animationDuration", durations, "0s");
  assignAnimationLonghand(styleObj, "animationDelay", delays, "0s");
  assignAnimationLonghand(styleObj, "animationTimingFunction", timings, "ease");
  assignAnimationLonghand(styleObj, "animationDirection", directions, "normal");
  assignAnimationLonghand(styleObj, "animationFillMode", fillModes, "none");
  assignAnimationLonghand(styleObj, "animationPlayState", playStates, "running");
  assignAnimationLonghand(styleObj, "animationIterationCount", iterations, "1");

  return true;
}

function buildAnimationNameTemplate(j: JSCodeshift, names: string[]): ExpressionKind {
  const quasis = names.map((_, index) =>
    j.templateElement({ raw: index === 0 ? "" : ", ", cooked: index === 0 ? "" : ", " }, false),
  );
  quasis.push(j.templateElement({ raw: "", cooked: "" }, true));
  return j.templateLiteral(
    quasis,
    names.map((name) => j.identifier(name)),
  ) as ExpressionKind;
}

function assignAnimationLonghand(
  styleObj: Record<string, unknown>,
  prop: string,
  values: Array<string | null>,
  fallback: string,
): void {
  if (!values.some((entry) => entry !== null)) {
    return;
  }
  const resolved = values.map((entry) => entry ?? fallback);
  styleObj[prop] =
    resolved.length === 1 || resolved.every((entry) => entry === resolved[0])
      ? resolved[0]
      : resolved.join(", ");
}

/**
 * Resolves an interpolated animation declaration whose slot expressions
 * reference keyframes identifiers.
 *
 * Supports both the `animation` shorthand and `animation-name` longhand.
 * For shorthands, replaces each `__SC_EXPR_N__` placeholder with the
 * corresponding keyframes name, then delegates to
 * `expandStaticAnimationShorthand`.  For `animation-name`, resolves the
 * single slot directly to a JS identifier.
 *
 * Bails (returns null) on comma-separated multi-animation shorthands,
 * which the single-tuple parser cannot correctly model.
 */
/**
 * Guard + delegate for resolving an interpolated `animation`/`animation-name`
 * declaration. Returns `null` (so callers fall through to their normal handling)
 * unless the property is animation-related and keyframes names are available.
 */
export function tryExpandInterpolatedAnimation(args: {
  property?: string;
  valueRaw: string;
  slotExprById: Map<number, unknown>;
  keyframesNames?: Set<string>;
  j?: JSCodeshift;
  inlineKeyframeNameMap?: Map<string, string>;
}): Record<string, unknown> | null {
  const { property, keyframesNames, j } = args;
  if (property !== "animation" && property !== "animation-name") {
    return null;
  }
  if (!keyframesNames || keyframesNames.size === 0 || !j) {
    return null;
  }
  return expandInterpolatedAnimationShorthand({ ...args, keyframesNames, j });
}

function expandInterpolatedAnimationShorthand(args: {
  property?: string;
  valueRaw: string;
  slotExprById: Map<number, unknown>;
  keyframesNames: Set<string>;
  j: JSCodeshift;
  inlineKeyframeNameMap?: Map<string, string>;
}): Record<string, unknown> | null {
  const {
    property = "animation",
    valueRaw,
    slotExprById,
    keyframesNames,
    j,
    inlineKeyframeNameMap,
  } = args;

  if (property === "animation-name") {
    return resolveAnimationNameSlot(valueRaw, slotExprById, keyframesNames, j);
  }

  // Bail on comma-separated multi-animation values — the single-tuple
  // parser would collapse the list into incorrect longhands.
  if (valueRaw.includes(",")) {
    return null;
  }

  return resolveAnimationShorthandSlots(
    valueRaw,
    slotExprById,
    keyframesNames,
    j,
    inlineKeyframeNameMap,
  );
}

/** Resolves `animation-name: ${kf}` where the sole slot is a keyframes identifier. */
function resolveAnimationNameSlot(
  valueRaw: string,
  slotExprById: Map<number, unknown>,
  keyframesNames: Set<string>,
  j: JSCodeshift,
): Record<string, unknown> | null {
  const kfName = extractKeyframesIdentifierFromSlot(valueRaw, slotExprById, keyframesNames);
  if (!kfName) {
    return null;
  }
  return { animationName: j.identifier(kfName) };
}

/** Resolves `animation: ${kf} 1.6s ease-in-out infinite` by replacing placeholders and expanding. */
function resolveAnimationShorthandSlots(
  valueRaw: string,
  slotExprById: Map<number, unknown>,
  keyframesNames: Set<string>,
  j: JSCodeshift,
  inlineKeyframeNameMap: Map<string, string> | undefined,
): Record<string, unknown> | null {
  let modifiedValue = valueRaw;
  const usedKeyframeNames = new Set<string>();

  const placeholderRe = /__SC_EXPR_(\d+)__/g;
  let match: RegExpExecArray | null;
  while ((match = placeholderRe.exec(valueRaw))) {
    const slotId = Number(match[1]);
    const expr = slotExprById.get(slotId) as { type?: string; name?: string } | null | undefined;
    if (!expr || expr.type !== "Identifier" || !expr.name || !keyframesNames.has(expr.name)) {
      return null;
    }
    modifiedValue = modifiedValue.replace(match[0], expr.name);
    usedKeyframeNames.add(expr.name);
  }

  if (usedKeyframeNames.size === 0) {
    return null;
  }

  const expanded: Record<string, unknown> = {};
  if (
    expandStaticAnimationShorthand(
      modifiedValue,
      usedKeyframeNames,
      j,
      expanded,
      inlineKeyframeNameMap,
    )
  ) {
    return expanded;
  }
  return null;
}

/**
 * If `valueRaw` is exactly a single `__SC_EXPR_N__` placeholder whose slot
 * expression is a keyframes identifier, returns the identifier name.
 */
function extractKeyframesIdentifierFromSlot(
  valueRaw: string,
  slotExprById: Map<number, unknown>,
  keyframesNames: Set<string>,
): string | null {
  const m = valueRaw.match(/^__SC_EXPR_(\d+)__$/);
  if (!m) {
    return null;
  }
  const slotId = Number(m[1]);
  const expr = slotExprById.get(slotId) as { type?: string; name?: string } | null | undefined;
  if (!expr || expr.type !== "Identifier" || !expr.name || !keyframesNames.has(expr.name)) {
    return null;
  }
  return expr.name;
}

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
