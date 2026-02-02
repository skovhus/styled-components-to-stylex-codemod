import type { ASTNode } from "jscodeshift";
import type { WrapperEmitter } from "./wrapper-emitter.js";

export type EmitMinimalWrapperArgs = Parameters<WrapperEmitter["emitMinimalWrapper"]>[0];

export type EmitIntrinsicContext = {
  emitter: WrapperEmitter;
  emitted: ASTNode[];
  emitNamedPropsType: (localName: string, typeExprText: string, genericParams?: string) => boolean;
  emitMinimalWrapper: (args: EmitMinimalWrapperArgs) => ASTNode[];
  emitPropsType: (localName: string, typeText: string, allowAsProp: boolean) => boolean;
  markNeedsReactTypeImport: () => void;
};
