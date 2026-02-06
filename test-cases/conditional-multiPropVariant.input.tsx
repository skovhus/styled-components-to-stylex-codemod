import * as React from "react";
import styled from "styled-components";

// Support multi-property CSS blocks with variant-based ternaries.
// Pattern: props.variant === "value" ? "prop1: val1; prop2: val2;" : ...

type BadgeSize = "micro" | "small";

export const Badge = styled.span<{ $size: BadgeSize }>`
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  ${(props) =>
    props.$size === "micro"
      ? "height: 16px; font-size: 10px; padding: 0 4px;"
      : "height: 20px; font-size: 12px; padding: 0 6px;"}
`;

export const App = () => (
  <div>
    <Badge $size="micro">Micro</Badge>
    <Badge $size="small">Small</Badge>
  </div>
);
