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

const MoreActionsIcon = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  background: currentColor;
  border-radius: 999px;
`;

const HoverFocusContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f5f5f5;
  color: #333;

  ${MoreActionsIcon} {
    transform: scale(0.75);
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    color: #111;

    ${MoreActionsIcon} {
      opacity: 1;
    }
  }
`;

const NestedLink = styled.a`
  color: #2563eb;
`;

const NestedRow = styled.div`
  ${NestedLink} {
    display: flex;
  }
`;

const BoundaryItem = styled.div`
  padding: 6px;
`;

const BoundaryList = styled.div`
  ${BoundaryItem}:not(:last-child) {
    margin-bottom: 8px;
    border-bottom: 1px solid #cbd5e1;
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
    <br />
    <br />
    <HoverFocusContainer tabIndex={0}>
      Grouped parent pseudos
      <MoreActionsIcon />
    </HoverFocusContainer>
    <br />
    <br />
    <NestedRow>
      <NestedLink href="#">Nested link</NestedLink>
    </NestedRow>
    <BoundaryList>
      <BoundaryItem>Boundary one</BoundaryItem>
    </BoundaryList>
  </div>
);
