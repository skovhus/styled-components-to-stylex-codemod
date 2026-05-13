import * as React from "react";
import styled, { css } from "styled-components";

const Thing = styled.div`
  && {
    color: red;
    padding: 8px;
  }
`;

function BaseAction(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} />;
}

const SpecificAction = styled(BaseAction)<{ $active?: boolean }>`
  color: #1f2937;
  border: 1px solid #94a3b8;
  padding: 8px 12px;

  ${(props) =>
    props.$active
      ? css`
          background: #dbeafe;
        `
      : css`
          &&:hover {
            background: #fee2e2;
          }
        `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Thing>High specificity text (red, with padding)</Thing>
    <SpecificAction>Hover action</SpecificAction>
    <SpecificAction $active>Active action</SpecificAction>
  </div>
);
