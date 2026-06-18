/**
 * Resolves the underlying component name(s) a static member access like `Select.Option` refers to,
 * by structurally walking the defining module's AST.
 *
 * This replaces an earlier regex-over-source approach: regexes could not reliably skip type
 * annotations, stop at the right `;`, or distinguish identifiers from type names. We parse once
 * (cached per source) with the shared prepass parser and answer member lookups against real nodes.
 */
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";
import { identifierName } from "../utilities/jscodeshift-utils.js";
import { walkAst } from "../utilities/ast-walk.js";

/**
 * Given the module `source`, the candidate root component names a local binding resolves to, and a
 * static member path (`["Option"]` for `Select.Option`), returns every component name the member
 * path can statically resolve to, plus the final member name as a fallback (matching the prior
 * behavior so downstream metadata lookups still have something to try).
 */
export function resolveStaticMemberComponentNames(
  source: string,
  rootNames: readonly string[],
  memberPath: readonly string[],
  parserName: PrepassParserName = "tsx",
): string[] {
  const program = parseProgram(source, parserName);
  const fallbackMember = memberPath[memberPath.length - 1];
  const fallback = fallbackMember ? [fallbackMember] : [];
  if (!program) {
    return [...new Set([...rootNames, ...fallback])];
  }

  const index = buildModuleIndex(program);
  let owners = expandStaticComponentOwners(index, rootNames);
  for (const memberName of memberPath) {
    const nextOwners = new Set<string>();
    for (const ownerName of owners) {
      for (const target of findStaticMemberTargets(index, ownerName, memberName)) {
        nextOwners.add(target);
      }
    }
    owners = nextOwners;
    if (owners.size === 0) {
      break;
    }
  }
  return [...new Set([...owners, ...fallback])];
}

/* ── Non-exported helpers ─────────────────────────────────────────────── */

interface ModuleIndex {
  /** Top-level `const`/`let`/`var` initializer expression keyed by binding name. */
  initializers: Map<string, AstNode>;
  /** All `Owner.member = Target` assignments, indexed by `Owner` then `member`. */
  memberAssignments: Map<string, Map<string, Set<string>>>;
}

const programCache = new Map<string, AstNode | null>();

function parseProgram(source: string, parserName: PrepassParserName): AstNode | null {
  const cached = programCache.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const parsed = tryParse(source, parserName);
  programCache.set(source, parsed);
  return parsed;
}

function tryParse(source: string, parserName: PrepassParserName): AstNode | null {
  for (const name of parserName === "tsx" ? (["tsx", "ts"] as const) : [parserName]) {
    try {
      const ast = createPrepassParser(name).parse(source) as AstNode;
      return (ast.program as AstNode | undefined) ?? ast;
    } catch {
      // Try the next parser variant; a definition file may not contain JSX.
    }
  }
  return null;
}

function buildModuleIndex(program: AstNode): ModuleIndex {
  const initializers = new Map<string, AstNode>();
  const memberAssignments = new Map<string, Map<string, Set<string>>>();

  walkAst(program, (node) => {
    if (node.type === "VariableDeclarator") {
      const name = identifierName(node.id as AstNode | undefined);
      const init = node.init as AstNode | undefined;
      if (name && init) {
        initializers.set(name, init);
      }
      return;
    }
    if (node.type === "AssignmentExpression" && node.operator === "=") {
      const target = capitalizedIdentifierName(node.right as AstNode | undefined);
      const member = staticMemberAccess(node.left as AstNode | undefined);
      if (target && member) {
        addMemberTarget(memberAssignments, member.object, member.property, target);
      }
    }
  });

  return { initializers, memberAssignments };
}

/**
 * Expands the root binding names to every capitalized identifier transitively referenced from their
 * initializers (e.g. `const X = cond ? A : B` pulls in `A` and `B`). Mirrors the breadth the member
 * lookup needs without assuming a particular declaration shape.
 */
function expandStaticComponentOwners(
  index: ModuleIndex,
  rootNames: readonly string[],
): Set<string> {
  const owners = new Set(rootNames);
  const visit = (name: string): void => {
    const init = index.initializers.get(name);
    if (!init) {
      return;
    }
    for (const referenced of collectCapitalizedIdentifiers(init)) {
      if (!owners.has(referenced)) {
        owners.add(referenced);
        visit(referenced);
      }
    }
  };
  for (const name of rootNames) {
    visit(name);
  }
  return owners;
}

function findStaticMemberTargets(
  index: ModuleIndex,
  ownerName: string,
  memberName: string,
): Set<string> {
  const targets = new Set<string>(index.memberAssignments.get(ownerName)?.get(memberName) ?? []);

  const init = index.initializers.get(ownerName);
  for (const objectLiteral of objectLiteralsFromInitializer(index, init)) {
    collectMemberTargetsFromObjectLiteral(objectLiteral, memberName, targets);
  }
  return targets;
}

/** Object expressions an owner's value is built from: a direct literal or `Object.assign(...)` args. */
function objectLiteralsFromInitializer(index: ModuleIndex, init: AstNode | undefined): AstNode[] {
  if (!init) {
    return [];
  }
  if (init.type === "ObjectExpression") {
    return [init];
  }
  if (isObjectAssignCall(init)) {
    const literals: AstNode[] = [];
    for (const arg of (init.arguments as AstNode[] | undefined) ?? []) {
      if (arg.type === "ObjectExpression") {
        literals.push(arg);
      } else {
        const referenced = identifierName(arg);
        const referencedInit = referenced ? index.initializers.get(referenced) : undefined;
        if (referencedInit?.type === "ObjectExpression") {
          literals.push(referencedInit);
        }
      }
    }
    return literals;
  }
  return [];
}

function collectMemberTargetsFromObjectLiteral(
  objectLiteral: AstNode,
  memberName: string,
  targets: Set<string>,
): void {
  for (const property of (objectLiteral.properties as AstNode[] | undefined) ?? []) {
    if (property.type !== "ObjectProperty" && property.type !== "Property") {
      continue;
    }
    if (identifierName(property.key as AstNode | undefined) !== memberName) {
      continue;
    }
    const target = capitalizedIdentifierName(property.value as AstNode | undefined);
    if (target) {
      targets.add(target);
    }
  }
}

function isObjectAssignCall(node: AstNode): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const member = staticMemberAccess(node.callee as AstNode | undefined);
  return member?.object === "Object" && member.property === "assign";
}

function collectCapitalizedIdentifiers(node: AstNode): Set<string> {
  const names = new Set<string>();
  walkAst(node, (child) => {
    if (child.type === "Identifier" && /^[A-Z]/.test(String(child.name))) {
      names.add(String(child.name));
    }
  });
  return names;
}

function staticMemberAccess(
  node: AstNode | undefined,
): { object: string; property: string } | null {
  if (
    !node ||
    (node.type !== "MemberExpression" && node.type !== "OptionalMemberExpression") ||
    node.computed === true
  ) {
    return null;
  }
  const object = identifierName(node.object as AstNode | undefined);
  const property = identifierName(node.property as AstNode | undefined);
  return object && property ? { object, property } : null;
}

function addMemberTarget(
  memberAssignments: Map<string, Map<string, Set<string>>>,
  object: string,
  property: string,
  target: string,
): void {
  let byMember = memberAssignments.get(object);
  if (!byMember) {
    byMember = new Map();
    memberAssignments.set(object, byMember);
  }
  let targets = byMember.get(property);
  if (!targets) {
    targets = new Set();
    byMember.set(property, targets);
  }
  targets.add(target);
}

function capitalizedIdentifierName(node: AstNode | undefined): string | null {
  const name = identifierName(node);
  return name && /^[A-Z]/.test(name) ? name : null;
}
