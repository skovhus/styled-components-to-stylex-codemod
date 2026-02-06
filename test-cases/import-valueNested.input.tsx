import React from "react";
import styled from "styled-components";
import { config } from "./lib/helpers";

const Card = styled.div`
  padding: ${config.ui.spacing.medium};
  margin: ${config.ui.spacing.small};
  background: white;
  border-radius: 8px;
`;

export function App() {
  return <Card />;
}
