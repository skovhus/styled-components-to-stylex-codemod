import React from "react";
import styled from "styled-components";

export const App = () => {
  return (
    <Header>
      <FullWidthCopyText as="label">Invite link</FullWidthCopyText>
    </Header>
  );
};

const Header = styled.div`
  margin-bottom: 4px;
`;

const FullWidthCopyText = styled.div`
  width: 100%;
`;
