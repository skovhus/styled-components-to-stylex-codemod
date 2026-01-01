import type { Adapter } from "./adapter.js";
import type { DynamicNodePlugin } from "./plugins.js";

/**
 * Single "user hook" entry point for customizing the codemod.
 *
 * Users provide ONE module that exports a hook (recommended), instead of
 * separately wiring adapter + plugins.
 */
export type UserHook = {
  /**
   * Adapter controls how resolved semantic values are emitted (imports, declarations,
   * and how theme/helper references become StyleX-compatible code).
   */
  adapter?: Adapter;

  /**
   * Plugins control how dynamic interpolations are recognized and rewritten.
   */
  plugins?: DynamicNodePlugin[];
};

/**
 * Helper for nicer user authoring + type inference.
 *
 * Usage:
 *   export default defineHook({ adapter, plugins })
 */
export function defineHook(hook: UserHook): UserHook {
  return hook;
}
