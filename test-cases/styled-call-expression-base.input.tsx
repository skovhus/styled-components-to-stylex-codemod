import React from "react";
import styled from "styled-components";
import { wrapComponent } from "./lib/helpers";

const BaseComponent = (props: React.ComponentProps<"div">) => <div {...props} />;

// styled() wrapping a CallExpression (function call result)
// The base component is `wrapComponent(BaseComponent)` which is a CallExpression
const WrappedStyled = styled(wrapComponent(BaseComponent))`
  color: red;
`;

export const App = () => <WrappedStyled>Hello</WrappedStyled>;
