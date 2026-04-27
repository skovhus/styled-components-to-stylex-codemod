// Static attrs override conflicting props passed at the usage site.
// styled-components merges as { ...userProps, ...attrs } so attrs wins —
// both for props forwarded to the wrapped component AND for props read
// inside the CSS template.
import styled from "styled-components";

const StyledBox = styled.div.attrs({
  // attrs wins over a `color` prop passed at the usage site
  color: "crimson",
})<{ color?: string }>`
  background-color: ${(props) => props.color};
  color: white;
  padding: 16px 24px;
  border-radius: 4px;
  font-weight: 600;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    {/* Renders crimson — attrs override the dodgerblue passed at usage */}
    <StyledBox color="dodgerblue">attrs wins (crimson)</StyledBox>
    {/* Renders crimson — no conflict, attrs applied */}
    <StyledBox>attrs default (crimson)</StyledBox>
  </div>
);
