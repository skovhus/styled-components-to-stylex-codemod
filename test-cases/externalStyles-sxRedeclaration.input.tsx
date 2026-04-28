// Regression test: when externalInterface adds an `sx` prop to an exported
// wrapper AND the codemod uses the verbose `const sx = stylex.props(...)`
// pattern (no styleMerger), the emitted variable must be renamed (e.g. `_sx`)
// to avoid the TS2451 "Cannot redeclare block-scoped variable 'sx'" caused by
// shadowing the destructured `sx` prop.
//
// This fixture is regenerated under `appLikeAdapter` (styleMerger: null,
// useSxProp: false) so it exercises the verbose merging path. With the
// fixtureAdapter (mergedSx merger / useSxProp: true) the verbose pattern is
// never emitted and the bug cannot manifest.

import styled from "styled-components";

export const Box = styled.div<{ $highlight?: boolean }>`
  padding: 8px;
  ${(p) => p.$highlight && "background: yellow;"}
`;

// Multiple call sites force the codemod to emit a function wrapper instead of inlining.
export const App = () => (
  <>
    <Box>one</Box>
    <Box $highlight>two</Box>
  </>
);
