/**
 * Entry point that orchestrates intrinsic wrapper emission.
 */
import type { ASTNode } from "jscodeshift";
import type { WrapperEmitter } from "./wrapper-emitter.js";
import { createEmitIntrinsicHelpers, type EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import {
  emitEnumVariantWrappers,
  emitInputWrappers,
  emitLinkWrappers,
  emitSiblingWrappers,
} from "./emit-intrinsic-specialized.js";
import { emitIntrinsicPolymorphicWrappers } from "./emit-intrinsic-polymorphic.js";
import { emitShouldForwardPropWrappers } from "./emit-intrinsic-should-forward-prop.js";
import {
  emitSimpleExportedIntrinsicWrappers,
  emitSimpleWithConfigWrappers,
} from "./emit-intrinsic-simple.js";

export function emitIntrinsicWrappers(emitter: WrapperEmitter): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
} {
  const root = emitter.root;
  const j = emitter.j;
  const emitTypes = emitter.emitTypes;
  const wrapperDecls = emitter.wrapperDecls;
  const wrapperNames = emitter.wrapperNames;
  const stylesIdentifier = emitter.stylesIdentifier;
  const patternProp = emitter.patternProp;

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  const emitNamedPropsType = (localName: string, typeExprText: string, genericParams?: string) =>
    emitter.emitNamedPropsType({ localName, typeExprText, genericParams, emitted });

  const markNeedsReactTypeImport = () => {
    needsReactTypeImport = true;
  };

  const helpers = createEmitIntrinsicHelpers({
    emitter,
    root,
    j,
    stylesIdentifier,
    emitNamedPropsType,
    markNeedsReactTypeImport,
  });

  const ctx: EmitIntrinsicContext = {
    emitter,
    j,
    emitTypes,
    wrapperDecls,
    wrapperNames,
    stylesIdentifier,
    patternProp,
    emitted,
    markNeedsReactTypeImport,
    helpers,
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
