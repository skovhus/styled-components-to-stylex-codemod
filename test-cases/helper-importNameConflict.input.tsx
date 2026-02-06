import React from "react";
import styled from "styled-components";
import { transitionSpeed } from "./lib/helpers";

const speedLabel = transitionSpeed("fast");

/**
 * Test case for helper name conflicts.
 * The adapter should alias its StyleX import when the helper is used outside styled templates.
 */
const Box = styled.div`
  transition: color ${transitionSpeed("normal")};
`;

export const App = () => (
  <div>
    <div>{speedLabel}</div>
    <Box />
  </div>
);
