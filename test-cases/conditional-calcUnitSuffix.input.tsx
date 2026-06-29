// Ternary length branches (calc string vs numeric) followed by a literal unit suffix
import styled from "styled-components";

const HEADER_HEIGHT = 40;

// The trailing `px` must apply only to the numeric branch — appending it to the
// `calc(...)` branch would produce invalid CSS ("calc(40px + 8px)px").
export const Panel = styled.div<{ $collapsed: boolean }>`
  height: ${(props) => (props.$collapsed ? `calc(${HEADER_HEIGHT}px + 8px)` : HEADER_HEIGHT)}px;
  background-color: lightblue;
`;

// Numeric branch is a runtime prop, so the `px` suffix stays on that branch.
export const Spacer = styled.div<{ $wide: boolean; $size: number }>`
  width: ${(props) => (props.$wide ? `calc(100% - ${props.$size}px)` : props.$size)}px;
  background-color: lightgreen;
`;

// Only the numeric branches are rendered for visual comparison: the original
// styled-components input emits invalid CSS for the `calc(...)` branch (the
// trailing `px` corrupts it), so input and output cannot render identically
// there. The codemod still transforms that branch correctly (see .output.tsx).
export const App = () => (
  <div style={{ display: "flex", gap: "8px" }}>
    <Panel $collapsed={false}>Header height</Panel>
    <Spacer $wide={false} $size={48}>
      Fixed size
    </Spacer>
  </div>
);
