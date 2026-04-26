import styled, { css } from "styled-components";
import { CollapseArrowIcon } from "./lib/collapse-arrow-icon";

const highlight = "hover";

const TitleWrapper = styled.div`
  height: 28px;
  padding: 0px 8px;

  ${(props: { onClick?: unknown; disabled?: boolean }) =>
    props.onClick && !props.disabled
      ? css`
          &:${highlight} ${CollapseArrowIcon} {
            display: block;
          }
        `
      : ""}
`;

export const App = () => (
  <TitleWrapper onClick={() => {}} disabled={false}>
    <CollapseArrowIcon />
  </TitleWrapper>
);
