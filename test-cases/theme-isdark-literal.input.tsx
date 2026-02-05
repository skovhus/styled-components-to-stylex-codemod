import * as React from "react";
import styled from "styled-components";

const Box = styled.div`
  display: flex;
  mix-blend-mode: ${(props) => (props.theme.isDark ? "lighten" : "darken")};
  opacity: ${(props) => (props.theme.isDark ? 0.9 : 0.8)};
  background: ${(props) => (props.theme.isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.035)")};
`;

export const App = () => <Box />;
