import React from "react";
import styled from "styled-components";

function ComponentLoader(props: { content: string; ref?: React.Ref<HTMLDivElement> }) {
  return <div>{props.content}</div>;
}

const Component = styled(ComponentLoader)`
  padding: 24px 0 48px;
`;

export const App = () => <Component content="hello" />;
