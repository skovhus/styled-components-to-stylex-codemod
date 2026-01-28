import {
  collectCreateGlobalStyleWarnings,
  collectThemeProviderSkipWarnings,
  shouldSkipForCreateGlobalStyle,
  shouldSkipForThemeProvider,
} from "../policy.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Applies skip policies and emits warnings for unsupported styled-components features.
 */
export function applyPolicyGates(ctx: TransformContext): StepResult {
  const { root, j, styledImports, warnings } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // Policy: ThemeProvider usage is project-specific. If the file uses ThemeProvider, skip entirely.
  if (shouldSkipForThemeProvider({ root, j, styledImports })) {
    return returnResult(
      {
        code: null,
        warnings: collectThemeProviderSkipWarnings({ root, j, styledImports }),
      },
      "skip",
    );
  }

  // Policy: createGlobalStyle is unsupported in StyleX; emit a warning when imported.
  warnings.push(...collectCreateGlobalStyleWarnings(styledImports));

  if (shouldSkipForCreateGlobalStyle({ styledImports, j })) {
    return returnResult({ code: null, warnings }, "skip");
  }

  return CONTINUE;
}
