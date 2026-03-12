// Style-only props from wrapper type should NOT be forwarded to imported wrapped component
import styled from "styled-components";
import { Flex } from "./lib/flex";

type ScrollableProps = {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  $applyBackground?: boolean;
};

/**
 * Exported styled(ImportedComponent) with non-$-prefixed prop used only for CSS.
 * The gutter prop is only used in the CSS template and should NOT be forwarded to Flex.
 */
export const Scrollable = styled(Flex)<ScrollableProps>`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${(props) => (props.$applyBackground ? "gray" : "inherit")};
  scrollbar-gutter: ${(props) => props.gutter || "auto"};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Scrollable gutter="stable" $applyBackground gap={8}>
      <div>Stable gutter with background</div>
    </Scrollable>
    <Scrollable gutter="auto" gap={4}>
      <div>Auto gutter, no background</div>
    </Scrollable>
    <Scrollable gap={12}>
      <div>Default (no gutter, no background)</div>
    </Scrollable>
  </div>
);
