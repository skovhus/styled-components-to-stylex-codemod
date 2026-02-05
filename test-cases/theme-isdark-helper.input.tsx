import * as React from "react";
import styled from "styled-components";
import { color, transitionSpeed } from "./lib/helpers";

const Box = styled.div`
  color: ${(props) => color(props.theme.isDark ? "textPrimary" : "textSecondary")};
  transition-duration: ${(props) => transitionSpeed(props.theme.isDark ? "fast" : "slow")};
`;

export const App = () => <Box />;
