import styled from "styled-components";
import { animated } from "./lib/react-spring";

// Test: styled(MemberExpression).attrs() pattern
// This tests that styled(animated.div).attrs() is correctly transformed,
// similar to styled(Component).attrs() where Component is an Identifier.

// Simple styled component
const SimpleBox = styled.div`
  display: block;
`;

// styled(Component.sub).attrs() - MemberExpression with attrs
const AnimatedBox = styled(animated.div).attrs({
  role: "region",
})`
  display: flex;
  align-items: center;
`;

export const App = () => (
  <SimpleBox>
    <AnimatedBox>Hello</AnimatedBox>
  </SimpleBox>
);
