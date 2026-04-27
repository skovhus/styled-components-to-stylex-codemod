// Stub for oxc-resolver in the browser. The real package depends on a WASM
// binding that vite cannot bundle. The codemod's wrapped-component sx-aware
// detection only uses the resolver to find files on disk — in the playground
// there is no disk, so the stubbed factory just fails every resolve and the
// detection falls through to its "couldn't see source" branch.
export class ResolverFactory {
  constructor(_config: unknown) {}
  resolveFileSync(_fromFile: string, _specifier: string): { path: null } {
    return { path: null };
  }
}
