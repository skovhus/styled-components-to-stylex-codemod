/**
 * Converts styled-components keyframes into StyleX keyframes objects.
 * Core concepts: Stylis parsing and keyframes extraction.
 */
import type { ASTNode, Collection, ImportDeclaration, JSCodeshift } from "jscodeshift";
import { compile } from "stylis";
import type { CssRuleIR } from "./css-ir.js";
import { cssPropertyToStylexProp, resolveBackgroundStylexProp } from "./css-prop-mapping.js";
import { classifyAnimationTokens } from "./lower-rules/animation.js";

export function convertStyledKeyframes(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
  keyframesLocal: string;
  objectToAst: (j: JSCodeshift, value: Record<string, unknown>) => ExpressionKind;
}): { keyframesNames: Set<string>; changed: boolean } {
  return convertStyledKeyframesImpl(args);
}

function parseKeyframesTemplate(args: {
  template: ASTNode | null | undefined;
}): Record<string, Record<string, unknown>> | null {
  const { template } = args;
  if (!template || template.type !== "TemplateLiteral") {
    return null;
  }
  if ((template.expressions?.length ?? 0) > 0) {
    return null;
  }
  const rawCss = (template.quasis ?? []).map((q: any) => q.value?.raw ?? "").join("");
  const wrapped = `@keyframes __SC_KEYFRAMES__ { ${rawCss} }`;
  const ast = compile(wrapped) as any[];

  const frames: Record<string, Record<string, unknown>> = {};
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
      const frameKey = String(node.value ?? "").trim();
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
        const prop = cssPropertyToStylexProp(
          raw === "background" ? resolveBackgroundStylexProp(valueRaw) : raw,
        );
        styleObj[prop] = /^-?\d+(\.\d+)?$/.test(valueRaw) ? Number(valueRaw) : valueRaw;
      }

      frames[frameKey] = styleObj;
      return;
    }
    visit(node.children);
  };
  visit(ast);
  return Object.keys(frames).length ? frames : null;
}

function convertStyledKeyframesImpl(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  styledImports: Collection<ImportDeclaration>;
  keyframesLocal: string;
  objectToAst: (j: JSCodeshift, value: Record<string, unknown>) => ExpressionKind;
}): { keyframesNames: Set<string>; changed: boolean } {
  const { root, j, styledImports, keyframesLocal, objectToAst } = args;

  const keyframesNames = new Set<string>();
  let changed = false;

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
      const frames = parseKeyframesTemplate({ template });
      if (!frames) {
        return;
      }

      p.node.init = j.callExpression(
        j.memberExpression(j.identifier("stylex"), j.identifier("keyframes")),
        [objectToAst(j, frames)],
      );
      keyframesNames.add(localName);
      changed = true;
    });

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

  return { keyframesNames, changed };
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

    const frameKey = rule.selector.trim();
    const styleObj: Record<string, unknown> = frames[frameKey] ?? {};
    for (const d of rule.declarations) {
      if (d.value.kind !== "static") {
        continue;
      }
      const prop = cssPropertyToStylexProp(
        d.property === "background" ? resolveBackgroundStylexProp(d.valueRaw) : d.property,
      );
      const valueRaw = d.valueRaw.trim();
      styleObj[prop] = /^-?\d+(\.\d+)?$/.test(valueRaw) ? Number(valueRaw) : valueRaw;
    }
    frames[frameKey] = styleObj;
  }

  return result;
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
): boolean {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length === 0) {
    return false;
  }

  // Find the animation name: the first token that matches an inline keyframe name
  const nameIdx = tokens.findIndex((t) => inlineKeyframeNames.has(t));
  if (nameIdx < 0) {
    return false;
  }

  const name = tokens[nameIdx]!;
  const remaining = tokens.filter((_, i) => i !== nameIdx);

  styleObj.animationName = j.identifier(name);

  const classified = classifyAnimationTokens(remaining);
  if (classified.duration) {
    styleObj.animationDuration = classified.duration;
  }
  if (classified.delay) {
    styleObj.animationDelay = classified.delay;
  }
  if (classified.timing) {
    styleObj.animationTimingFunction = classified.timing;
  }
  if (classified.direction) {
    styleObj.animationDirection = classified.direction;
  }
  if (classified.fillMode) {
    styleObj.animationFillMode = classified.fillMode;
  }
  if (classified.playState) {
    styleObj.animationPlayState = classified.playState;
  }
  if (classified.iteration) {
    styleObj.animationIterationCount = classified.iteration;
  }

  return true;
}

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
