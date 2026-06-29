import styled from "styled-components";
const defaults = { role: "button" };
const SkippedBox = styled.div.attrs({ ...defaults })`
  & > * {
    color: red;
  }
`;
const OkBox = styled.div`
  padding: 8px;
  background-color: #ddd6fe;
`;
export const App = () => (
  <div>
    <SkippedBox>Skipped</SkippedBox>
    <OkBox>Converted</OkBox>
  </div>
);
