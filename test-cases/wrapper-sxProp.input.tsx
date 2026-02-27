// Wrapping a previously-transformed StyleX component should use sx prop
import * as React from "react";
import styled from "styled-components";
import { StyleXButton } from "./lib/stylex-button";

export const PrimaryButton = styled(StyleXButton)`
  background-color: blue;
  color: white;
  font-weight: bold;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <PrimaryButton>Primary</PrimaryButton>
    <PrimaryButton disabled>Disabled</PrimaryButton>
  </div>
);
