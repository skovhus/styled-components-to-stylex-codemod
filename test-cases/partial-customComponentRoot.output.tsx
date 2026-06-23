import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { Text } from "./lib/styled-text";

const Title = styled(Text)`
  color: #1d4ed8;
  font-weight: 600;
`;

export const App = () => (
  <div sx={styles.notice}>
    <Title variant="small">Imported custom root</Title>
  </div>
);

const styles = stylex.create({
  notice: {
    padding: 8,
    backgroundColor: "#eef2ff",
  },
});
