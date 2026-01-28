import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

export const StyledHeader = styled.header`
  display: flex;
  &:not(:only-child) {
    border-bottom: ${thinPixel()} solid var(--settings-list-view-border-color);
  }
`;

export const App = () => <StyledHeader />;
