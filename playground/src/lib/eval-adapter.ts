import { defineAdapter, type Adapter } from "../../../src/adapter";

/**
 * Evaluate user's adapter code and return an Adapter instance.
 * The code should be an object literal with resolveValue() method.
 */
export function evalAdapter(code: string): Adapter {
  // Wrap user code in a function and evaluate
  // oxlint-disable-next-line typescript-eslint/no-implied-eval
  const fn = new Function(`return (${code})`);
  const adapterConfig = fn();
  return defineAdapter(adapterConfig);
}
