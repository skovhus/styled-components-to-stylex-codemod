import jscodeshift from "jscodeshift";
import { transformWithWarnings } from "../../../src/transform";
import type { Adapter } from "../../../src/adapter";
import type { WarningLog } from "../../../src/internal/logger";

export type { WarningLog };

interface TransformResult {
  code: string | null;
  warnings: WarningLog[];
}

/**
 * Run the styled-components to StyleX transform in the browser.
 */
export function runTransform(
  source: string,
  adapter: Adapter,
  filename = "input.tsx",
): TransformResult {
  const j = jscodeshift.withParser("tsx");

  const file = {
    source,
    path: filename,
  };

  const api = {
    jscodeshift: j,
    j,
    stats: () => {},
    report: () => {},
  };

  const options = { adapter };

  return transformWithWarnings(file, api, options);
}
