/**
 * Test case for descendant component selectors.
 * Demonstrates the `&:pseudo ${Component}` pattern being transformed to `stylex.when.ancestor()`.
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
  </div>
);
