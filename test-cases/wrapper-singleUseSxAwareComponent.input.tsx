// Single-use styled(Component) with an sx-aware base should inline into the JSX call site.
import styled from "styled-components";
import { flexCenter } from "./lib/helpers";
import { DynamicFlex } from "./lib/sx-dynamic-flex";

const TombstoneContainer = styled(DynamicFlex)`
  grid-area: br;
  background-color: #e0f2fe;
  border-radius: 4px;
  padding: 16px;
  ${flexCenter()}
`;

export const App = () => (
  <div style={{ display: "grid", gridTemplateAreas: '"br"', padding: 16 }}>
    <TombstoneContainer justify="center" align="center" gap={16}>
      Tombstone flex
    </TombstoneContainer>
  </div>
);
