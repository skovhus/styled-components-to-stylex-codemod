// Single-use styled(Component) with an sx-aware base should inline into the JSX call site.
import styled from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { flexCenter } from "./lib/helpers";
import { DynamicFlex } from "./lib/sx-dynamic-flex";
import { Text } from "./lib/sx-aware-text";

const TombstoneContainer = styled(DynamicFlex)`
  grid-area: br;
  background-color: #e0f2fe;
  border-radius: 4px;
  padding: 16px;
  ${flexCenter()}
`;

const TitleText = styled(Text)`
  margin-bottom: 12px;
`;

const BasicContainer = styled(DynamicFlex)`
  padding: 3px 6px;
  gap: 8px;
  align-items: center;
`;

export const App = (props: { className?: string; sx?: stylex.StyleXStyles }) => (
  <div style={{ display: "grid", gridTemplateAreas: '"br"', padding: 16, gap: 12 }}>
    <TombstoneContainer justify="center" align="center" gap={16}>
      Tombstone flex
    </TombstoneContainer>
    <TitleText size="md" color="labelTitle" forwardedAs="p" align="center">
      Link
    </TitleText>
    <BasicContainer className={props.className} sx={props.sx}>
      Basic container
    </BasicContainer>
  </div>
);
