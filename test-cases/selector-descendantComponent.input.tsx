/**
 * Test case for descendant component selectors.
 * Demonstrates the `&:pseudo ${Component}` pattern being transformed to `stylex.when.ancestor()`.
 *
 * Also tests that interpolations with static suffixes preserve the correct order:
 * - `2px solid ${color}` should NOT become `2px solid ${color}` (prefix only)
 * - `${color} dashed` should correctly become `${color} dashed` (suffix preserved)
 */
import * as React from "react";
import styled from "styled-components";

const Content = styled.div`
  background: ${(props) => props.theme.color.bgSub};
  width: 100px;
  height: 100px;
`;

export const ContainerLink = styled.a`
  &:focus-visible ${Content} {
    outline: 10px solid ${(props) => props.theme.color.labelBase};
    outline-offset: 5px;
  }
`;

// Test: interpolation with static suffix (e.g., `0 4px 8px ${color}`)
const ShadowBox = styled.div`
  width: 50px;
  height: 50px;
  background: white;
`;

const ShadowContainer = styled.div`
  &:hover ${ShadowBox} {
    box-shadow: 0 4px 8px ${(props) => props.theme.color.labelBase};
  }
`;

const Icon = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-size: contain;
  border-radius: 50%;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #BF4F74;
  color: white;
  border: none;
  border-radius: 4px;

  ${Icon} {
    width: 20px;
    height: 20px;
    opacity: 0.8;
  }

  &:hover ${Icon} {
    opacity: 1;
    transform: scale(1.1);
  }
`;

export const App = () => (
  <div>
    <Button>
      Click me
      <Icon />
    </Button>
    <br />
    <br />
    <ContainerLink href="#">
      <Content />
    </ContainerLink>
    <br />
    <br />
    <ShadowContainer>
      <ShadowBox />
    </ShadowContainer>
  </div>
);
