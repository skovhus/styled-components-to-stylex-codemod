import React from "react";
import styled from "styled-components";

// -- Styled Components
/**
 * Page title with brand color styling.
 */
const Title = styled.h1`
  font-size: 1.5em;
  text-align: center;
  color: #bf4f74;
`;

// Page wrapper with padding
const Wrapper = styled.section`
  padding: 4em;
  background: papayawhip;
`;

// - Styles
export const Select = styled.select`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
`;

function Link(props: { to: string; children: React.ReactNode }) {
  return <a href={props.to}>{props.children}</a>;
}

const StyledSpan = styled.span`
  position: relative;
`;

const CountingSpan = styled.span`
  color: rebeccapurple;
`;

function Counter(props: { children: React.ReactNode }) {
  return <span data-count={React.Children.count(props.children)}>{props.children}</span>;
}

export function Repro(props: { integrationsPath: string }) {
  return (
    <>
      Browse <Link to={props.integrationsPath}>integrations</Link> to enable new agents, or manage
      access
      <StyledSpan>team</StyledSpan>
    </>
  );
}

export function ChildrenShapeRepro() {
  return (
    <Counter>
      Before <CountingSpan /> after
    </Counter>
  );
}

export const App = () => (
  <Wrapper>
    <Title>Hello World!</Title>
    <Repro integrationsPath="/integrations" />
    <ChildrenShapeRepro />
    <Select onChange={(e) => console.log(e.target.value)} />
  </Wrapper>
);
