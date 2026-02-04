/**
 * Shared helpers for variant condition parsing and application.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ArrowFnParamBindings } from "../utilities/jscodeshift-utils.js";
import { extractRootAndPath, resolveIdentifierToPropName } from "../utilities/jscodeshift-utils.js";
import { literalToStaticValue } from "./types.js";
import type { ExpressionKind, TestInfo } from "./decl-types.js";
import type { StyledDecl } from "../transform-types.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { mergeStyleObjects } from "./utils.js";

/**
 * Inverts a "when" condition string for the opposite variant branch.
 * E.g., "!$active" -> "$active", "$x === true" -> "$x !== true"
 */
export function invertWhen(when: string): string | null {
  if (when.startsWith("!")) {
    return when.slice(1);
  }
  const match = when.match(/^(.+)\s+(===|!==)\s+(.+)$/);
  if (match) {
    const [, propName, op, rhs] = match;
    const invOp = op === "===" ? "!==" : "===";
    return `${propName} ${invOp} ${rhs}`;
  }
  if (!when.includes(" ")) {
    return `!${when}`;
  }
  return null;
}

export function buildPseudoMediaPropValue(args: {
  j: JSCodeshift;
  valueExpr: ExpressionKind;
  pseudos?: string[] | null;
  media?: string | null;
}): ExpressionKind {
  const { j, valueExpr, pseudos, media } = args;
  const pseudoList = pseudos ?? [];
  const hasPseudos = pseudoList.length > 0;
  if (!media && !hasPseudos) {
    return valueExpr;
  }
  if (media && hasPseudos) {
    const pseudoProps = pseudoList.map((ps) =>
      j.property(
        "init",
        j.literal(ps),
        j.objectExpression([
          j.property("init", j.identifier("default"), j.literal(null)),
          j.property("init", j.literal(media), valueExpr),
        ]),
      ),
    );
    return j.objectExpression([
      j.property("init", j.identifier("default"), j.literal(null)),
      ...pseudoProps,
    ]);
  }
  if (media) {
    return j.objectExpression([
      j.property("init", j.identifier("default"), j.literal(null)),
      j.property("init", j.literal(media), valueExpr),
    ]);
  }
  const pseudoProps = pseudoList.map((ps) => j.property("init", j.literal(ps), valueExpr));
  return j.objectExpression([
    j.property("init", j.identifier("default"), j.literal(null)),
    ...pseudoProps,
  ]);
}

// Factory to create prop test helpers given the arrow function parameter bindings
export const createPropTestHelpers = (
  bindings: ArrowFnParamBindings,
): {
  parseTestInfo: (test: ExpressionKind) => TestInfo | null;
  parseChainedTestInfo: (test: ExpressionKind) => TestInfo | null;
} => {
  const paramName = bindings.kind === "simple" ? bindings.paramName : null;

  const getMemberExpressionSource = (node: ExpressionKind): string | null => {
    const info = extractRootAndPath(node);
    if (!info) {
      return null;
    }
    if (info.path.length === 0) {
      return info.rootName;
    }
    return `${info.rootName}.${info.path.join(".")}`;
  };

  const readPropAccess = (
    node: ExpressionKind,
  ): { propName: string; whenName: string } | null => {
    const info = extractRootAndPath(node);
    if (!info) {
      return null;
    }
    if (paramName && info.rootName === paramName) {
      if (info.path.length === 0) {
        return null;
      }
      const [propRoot, ...rest] = info.path;
      if (!propRoot) {
        return null;
      }
      const whenName = [propRoot, ...rest].join(".");
      return { propName: propRoot, whenName };
    }
    if (bindings.kind === "destructured") {
      const propName = resolveIdentifierToPropName(info.rootNode, bindings);
      if (!propName) {
        return null;
      }
      const whenName = info.path.length > 0 ? `${propName}.${info.path.join(".")}` : propName;
      return { propName, whenName };
    }
    return null;
  };

  const parseTestInfo = (test: ExpressionKind): TestInfo | null => {
    if (!test || typeof test !== "object") {
      return null;
    }
    // Handle bare Identifier from destructured params: ({ isBw }) => isBw && ...
    if (test.type === "Identifier" && bindings.kind === "destructured") {
      const propAccess = readPropAccess(test);
      return propAccess ? { when: propAccess.whenName, propName: propAccess.propName } : null;
    }
    if (test.type === "MemberExpression" || test.type === "OptionalMemberExpression") {
      const propAccess = readPropAccess(test);
      return propAccess ? { when: propAccess.whenName, propName: propAccess.propName } : null;
    }
    if (test.type === "UnaryExpression" && test.operator === "!" && test.argument) {
      const propAccess = readPropAccess(test.argument as ExpressionKind);
      return propAccess
        ? { when: `!${propAccess.whenName}`, propName: propAccess.propName }
        : null;
    }
    if (
      test.type === "BinaryExpression" &&
      (test.operator === "===" || test.operator === "!==")
    ) {
      const left = test.left;

      // Helper to get rhs value, including special handling for undefined Identifier
      const getRhsValue = (): string | null => {
        const rhsTyped = test.right as { type?: string; name?: string };
        // Handle undefined Identifier
        if (rhsTyped.type === "Identifier" && rhsTyped.name === "undefined") {
          return "undefined";
        }
        const rhs = literalToStaticValue(test.right);
        if (rhs === null) {
          return getMemberExpressionSource(test.right as ExpressionKind);
        }
        return JSON.stringify(rhs);
      };

      // Handle destructured identifier on left side
      if (bindings.kind === "destructured" && left.type === "Identifier") {
        const propAccess = readPropAccess(left as ExpressionKind);
        const rhsValue = getRhsValue();
        if (!propAccess || rhsValue === null) {
          return null;
        }
        return {
          when: `${propAccess.whenName} ${test.operator} ${rhsValue}`,
          propName: propAccess.propName,
        };
      }
      if (left.type === "MemberExpression" || left.type === "OptionalMemberExpression") {
        const propAccess = readPropAccess(left as ExpressionKind);
        const rhsValue = getRhsValue();
        if (!propAccess || rhsValue === null) {
          return null;
        }
        return {
          when: `${propAccess.whenName} ${test.operator} ${rhsValue}`,
          propName: propAccess.propName,
        };
      }
    }
    return null;
  };

  /**
   * Parse chained && conditions, returning a combined TestInfo.
   * For: props.a === "x" && props.b === 1
   * Returns: { when: 'a === "x" && b === 1', propName: 'b', allPropNames: ['a', 'b'] }
   */
  const parseChainedTestInfo = (test: ExpressionKind): TestInfo | null => {
    // First try parsing as a simple test
    const simple = parseTestInfo(test);
    if (simple) {
      return simple;
    }

    // Handle chained LogicalExpression with &&
    if (
      test &&
      typeof test === "object" &&
      test.type === "LogicalExpression" &&
      test.operator === "&&"
    ) {
      const leftInfo = parseChainedTestInfo(test.left);
      const rightInfo = parseTestInfo(test.right);
      if (leftInfo && rightInfo) {
        // Combine conditions with &&
        const combinedWhen = `${leftInfo.when} && ${rightInfo.when}`;
        // Collect all prop names from both sides of the chain
        const leftProps =
          leftInfo.allPropNames ?? (leftInfo.propName ? [leftInfo.propName] : []);
        const rightProps = rightInfo.propName ? [rightInfo.propName] : [];
        const allPropNames = [...new Set([...leftProps, ...rightProps])];
        // For chained conditions, we use the last propName as the primary
        // (this matches how variants are typically keyed)
        return { when: combinedWhen, propName: rightInfo.propName, allPropNames };
      }
    }

    return null;
  };

  return { parseTestInfo, parseChainedTestInfo };
};

export const createVariantApplier = (args: {
  decl: StyledDecl;
  variantBuckets: Map<string, Record<string, unknown>>;
  variantStyleKeys: Record<string, string>;
  toSuffixFromProp: (name: string) => string;
}) => {
  const { decl, variantBuckets, variantStyleKeys, toSuffixFromProp } = args;
  const dropAllTestInfoProps = (testInfo: TestInfo): void => {
    const propsToCheck = testInfo.allPropNames ?? (testInfo.propName ? [testInfo.propName] : []);
    for (const prop of propsToCheck) {
      if (prop && !prop.startsWith("$")) {
        ensureShouldForwardPropDrop(decl, prop);
      }
    }
  };
  // Shared helper to apply a style variant for a given test condition
  return (testInfo: TestInfo, consStyle: Record<string, unknown>): void => {
    const when = testInfo.when;
    const existingBucket = variantBuckets.get(when);
    const nextBucket = existingBucket ? { ...existingBucket } : {};
    mergeStyleObjects(nextBucket, consStyle);
    variantBuckets.set(when, nextBucket);
    variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
    // Drop all props used in the condition (for chained conditions, allPropNames has them all)
    dropAllTestInfoProps(testInfo);
  };
};
