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

const ClassNameBox = styled.div.attrs({
  // className is merged with the usage-site className, not replaced like normal attrs
  className: "static-class",
})<{ className?: string }>`
  color: ${(props) => props.className};
  background-color: #f6f6f6;
  padding: 16px 24px;
  border: 2px solid #222;
  border-radius: 4px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    {/* Renders crimson — attrs override the dodgerblue passed at usage */}
    <StyledBox color="dodgerblue">attrs wins (crimson)</StyledBox>
    {/* Renders crimson — no conflict, attrs applied */}
    <StyledBox>attrs default (crimson)</StyledBox>
    {/* className remains dynamic because attrs className is merged, not overwritten */}
    <ClassNameBox className="external-class">className stays dynamic</ClassNameBox>
    <ClassNameBox>static className still merges</ClassNameBox>
  </div>
);
