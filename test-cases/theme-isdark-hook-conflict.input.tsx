import * as React from "react";
import styled from "styled-components";

type BoxProps = {
  theme: { isDark: boolean };
};

const Box = styled.div<BoxProps>`
  color: ${(props) => (props.theme.isDark ? "white" : "black")};
`;

export const App = () => <Box theme={{ isDark: true }} />;
