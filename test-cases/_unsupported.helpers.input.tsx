import * as React from "react";
import styled from "styled-components";
import { color, truncate, flexCenter } from "./lib/helpers";

// Using CSS snippet helper for truncation
const TruncatedText = styled.p`
  ${truncate()}
  max-width: 200px;
  font-size: 14px;
  color: ${color("textPrimary")};
`;

// Using CSS snippet helper for flex centering
const CenteredCard = styled.div`
  ${flexCenter()}
  min-height: 100px;
  background-color: ${color("bgBase")};
  border: 1px solid ${color("bgSub")};
`;

export const App = () => (
  <CenteredCard>
    <TruncatedText>
      This is some text content that will be truncated if it gets too long.
    </TruncatedText>
  </CenteredCard>
);
