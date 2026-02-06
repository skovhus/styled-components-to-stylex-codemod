import styled from "styled-components";
import React from "react";

type LoadingProps = {
  delay?: number;
};

function Loading(props: LoadingProps) {
  return <div>Loading...</div>;
}

// Exported styled component with external styles enabled will destructure className/style
export const StyledLoading = styled(Loading)`
  height: 100%;
`;

export const App = () => <StyledLoading delay={1000} />;
