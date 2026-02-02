import type { JSCodeshift, Property } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import type { ExpressionKind } from "./types.js";

export function extraStyleArgsFor(emitter: WrapperEmitter, d: StyledDecl): ExpressionKind[] {
  const { j, stylesIdentifier } = emitter;
  return (d.extraStyleKeys ?? []).map((key) =>
    j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key)),
  );
}

export function shouldIncludeRestForProps(args: {
  usedAsValue: boolean;
  hasLocalUsage: boolean;
  usedAttrs: Set<string>;
  destructureProps: string[];
  hasExplicitPropsToPassThrough?: boolean;
  ignoreTransientAttrs?: boolean;
}): boolean {
  const {
    usedAsValue,
    hasLocalUsage,
    usedAttrs,
    destructureProps,
    hasExplicitPropsToPassThrough,
    ignoreTransientAttrs = false,
  } = args;
  let shouldIncludeRest =
    usedAsValue ||
    Boolean(hasExplicitPropsToPassThrough) ||
    (hasLocalUsage && usedAttrs.has("*")) ||
    (hasLocalUsage &&
      [...usedAttrs].some((n) => {
        if (
          n === "children" ||
          n === "className" ||
          n === "style" ||
          n === "as" ||
          n === "forwardedAs" ||
          (ignoreTransientAttrs && n.startsWith("$"))
        ) {
          return false;
        }
        return !destructureProps.includes(n);
      }));
  const hasOnlyTransientAttrs =
    !usedAttrs.has("*") && usedAttrs.size > 0 && [...usedAttrs].every((n) => n.startsWith("$"));
  if (!usedAsValue && hasOnlyTransientAttrs) {
    shouldIncludeRest = false;
  }
  return shouldIncludeRest;
}

export function buildCompoundVariantExpressions(args: {
  emitter: WrapperEmitter;
  compoundVariants: NonNullable<StyledDecl["compoundVariants"]>;
  styleArgs: ExpressionKind[];
  destructureProps?: string[];
}): void {
  const { emitter, compoundVariants, styleArgs, destructureProps } = args;
  const { j, stylesIdentifier } = emitter;
  for (const cv of compoundVariants) {
    // Add props to destructure list
    if (destructureProps) {
      if (!destructureProps.includes(cv.outerProp)) {
        destructureProps.push(cv.outerProp);
      }
      if (!destructureProps.includes(cv.innerProp)) {
        destructureProps.push(cv.innerProp);
      }
    }

    // Build: outerProp ? styles.outerKey : innerProp ? styles.innerTrueKey : styles.innerFalseKey
    const outerPropId = j.identifier(cv.outerProp);
    const innerPropId = j.identifier(cv.innerProp);
    const outerStyle = j.memberExpression(
      j.identifier(stylesIdentifier),
      j.identifier(cv.outerTruthyKey),
    );
    const innerTrueStyle = j.memberExpression(
      j.identifier(stylesIdentifier),
      j.identifier(cv.innerTruthyKey),
    );
    const innerFalseStyle = j.memberExpression(
      j.identifier(stylesIdentifier),
      j.identifier(cv.innerFalsyKey),
    );

    // Build inner ternary: innerProp ? innerTrueStyle : innerFalseStyle
    const innerTernary = j.conditionalExpression(innerPropId, innerTrueStyle, innerFalseStyle);

    // Build outer ternary: outerProp ? outerStyle : innerTernary
    const outerTernary = j.conditionalExpression(outerPropId, outerStyle, innerTernary);

    styleArgs.push(outerTernary);
  }
}

export function hasElementPropsInDefaultAttrs(d: StyledDecl): boolean {
  const defaultAttrs = d.attrsInfo?.defaultAttrs ?? [];
  return defaultAttrs.some((a) => a.jsxProp && !a.jsxProp.startsWith("$"));
}

export function mergeAsIntoPropsWithChildren(typeText: string): string | null {
  const prefix = "React.PropsWithChildren<";
  if (!typeText.trim().startsWith(prefix) || !typeText.trim().endsWith(">")) {
    return null;
  }
  const inner = typeText.trim().slice(prefix.length, -1).trim();
  if (inner === "{}") {
    return `${prefix}{ as?: React.ElementType }>`;
  }
  if (inner.startsWith("{") && inner.endsWith("}")) {
    let body = inner.slice(1, -1).trim();
    if (body.endsWith(";")) {
      body = body.slice(0, -1).trim();
    }
    const withAs = body.length > 0 ? `${body}; as?: React.ElementType` : "as?: React.ElementType";
    return `${prefix}{ ${withAs} }>`;
  }
  return null;
}

export function addAsPropToExistingType(emitter: WrapperEmitter, typeName: string): boolean {
  const { root, j, emitTypes } = emitter;
  if (!emitTypes) {
    return false;
  }
  let didUpdate = false;
  const interfaces = root.find(j.TSInterfaceDeclaration, {
    id: { type: "Identifier", name: typeName },
  } as any);
  interfaces.forEach((path: any) => {
    const iface = path.node;
    const members = iface.body?.body ?? [];
    const hasAs = members.some(
      (m: any) =>
        m.type === "TSPropertySignature" && m.key?.type === "Identifier" && m.key.name === "as",
    );
    if (hasAs) {
      didUpdate = true;
      return;
    }
    const parsed = j(`interface X { as?: React.ElementType }`).get().node.program.body[0] as any;
    const prop = parsed.body?.body?.[0];
    if (prop) {
      members.push(prop);
      didUpdate = true;
    }
  });
  if (didUpdate) {
    return true;
  }
  const typeAliases = root.find(j.TSTypeAliasDeclaration, {
    id: { type: "Identifier", name: typeName },
  } as any);
  typeAliases.forEach((path: any) => {
    const alias = path.node;
    const existing = alias.typeAnnotation;
    if (!existing) {
      return;
    }
    const existingStr = j(existing).toSource();
    if (existingStr.includes("as?:") || existingStr.includes("as :")) {
      didUpdate = true;
      return;
    }
    const parsed = j(`type X = { as?: React.ElementType };`).get().node.program.body[0] as any;
    const asType = parsed.typeAnnotation;
    if (!asType) {
      return;
    }
    if (existing.type === "TSIntersectionType") {
      existing.types = [...(existing.types ?? []), asType];
    } else {
      alias.typeAnnotation = j.tsIntersectionType([existing, asType]);
    }
    didUpdate = true;
  });
  return didUpdate;
}

export function asDestructureProp(j: JSCodeshift, tagName: string): Property {
  return j.property.from({
    kind: "init",
    key: j.identifier("as"),
    value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
    shorthand: false,
  });
}
