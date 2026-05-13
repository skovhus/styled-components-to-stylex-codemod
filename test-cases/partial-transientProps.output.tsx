import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const PreservedList = styled.ul<{ $active?: boolean }>`
  color: ${(props) => (props.$active ? "#111827" : "#6b7280")};
  padding: 8px;

  & li.selected {
    font-weight: 700;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <div sx={styles.convertedPanel}>Converted</div>
    <PreservedList $active>
      <li className="selected">Preserved transient prop</li>
    </PreservedList>
  </div>
);

const styles = stylex.create({
  convertedPanel: {
    padding: 12,
    backgroundColor: "#e0f2fe",
  },
});
