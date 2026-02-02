import type { ASTNode } from "jscodeshift";
import type { EmitIntrinsicContext, EmitMinimalWrapperArgs } from "./emit-intrinsic-context.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import { emitInputWrappers, emitLinkWrappers } from "./emit-intrinsic-input.js";
import { emitShouldForwardPropWrappers } from "./emit-intrinsic-should-forward.js";
import { emitSimpleWithConfigWrappers } from "./emit-intrinsic-with-config.js";
import { emitSiblingWrappers } from "./emit-intrinsic-sibling.js";
import { emitSimpleExportedIntrinsicWrappers } from "./emit-intrinsic-simple-exported.js";
import { addAsPropToExistingType, mergeAsIntoPropsWithChildren } from "./emit-intrinsic-helpers.js";
import { emitEnumVariantWrappers } from "./emit-intrinsic-enum.js";
import { emitIntrinsicPolymorphicWrappers } from "./emit-intrinsic-polymorphic.js";

export function emitIntrinsicWrappers(emitter: WrapperEmitter): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
} {
  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  const markNeedsReactTypeImport = () => {
    needsReactTypeImport = true;
  };

  const emitNamedPropsType = (localName: string, typeExprText: string, genericParams?: string) =>
    emitter.emitNamedPropsType({ localName, typeExprText, genericParams, emitted });

  const emitMinimalWrapper = (args: EmitMinimalWrapperArgs): ASTNode[] =>
    emitter.emitMinimalWrapper(args);

  const withAsPropType = (typeText: string, allowAsProp: boolean): string => {
    if (!allowAsProp) {
      return typeText;
    }
    const merged = mergeAsIntoPropsWithChildren(typeText);
    if (merged) {
      return merged;
    }
    return emitter.joinIntersection(typeText, "{ as?: React.ElementType }");
  };

  const emitPropsType = (localName: string, typeText: string, allowAsProp: boolean): boolean => {
    const typeAliasEmitted = emitNamedPropsType(localName, withAsPropType(typeText, allowAsProp));
    if (!typeAliasEmitted && allowAsProp) {
      addAsPropToExistingType(emitter, emitter.propsTypeNameFor(localName));
    }
    markNeedsReactTypeImport();
    return typeAliasEmitted;
  };

  const ctx: EmitIntrinsicContext = {
    emitter,
    emitted,
    emitNamedPropsType,
    emitMinimalWrapper,
    emitPropsType,
    markNeedsReactTypeImport,
  };

  emitInputWrappers(ctx);
  emitLinkWrappers(ctx);
  emitIntrinsicPolymorphicWrappers(ctx);
  emitEnumVariantWrappers(ctx);
  emitShouldForwardPropWrappers(ctx);
  emitSimpleWithConfigWrappers(ctx);
  emitSiblingWrappers(ctx);
  emitSimpleExportedIntrinsicWrappers(ctx);

  return { emitted, needsReactTypeImport };
}
