import * as React from "react";
import styled from "styled-components";
import { Text } from "./lib/styled-text";

const Notice = styled.div`
  padding: 8px;
  background-color: #eef2ff;
`;

const Title = styled(Text)`
  color: #1d4ed8;
  font-weight: 600;
`;

export const App = () => (
  <Notice>
    <Title variant="small">Imported custom root</Title>
  </Notice>
);
