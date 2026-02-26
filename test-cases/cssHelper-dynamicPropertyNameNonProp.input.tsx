// Non-prop conditional with dynamic property-name split and multiple declarations
import * as React from "react";
import styled from "styled-components";

const Browser = { isSafari: true };

type StackProps = {
  column?: boolean;
  gap?: number;
  className?: string;
  children?: React.ReactNode;
};

export const Stack = styled.div<StackProps>`
  display: flex;
  ${({ gap = 8, column }) =>
    Browser.isSafari ? `${column ? "column" : "row"}-gap: ${gap}px; margin-top: ${gap}px;` : ""};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
    <Stack gap={10} style={{ background: "#d6efff", padding: 8 }}>
      <div style={{ background: "#4ea8de", color: "white", padding: 8 }}>Row gap + margin top</div>
      <div style={{ background: "#4ea8de", color: "white", padding: 8 }}>Row gap + margin top</div>
    </Stack>
    <Stack column gap={12} style={{ background: "#ffe4cf", padding: 8 }}>
      <div style={{ background: "#f9844a", color: "white", padding: 8 }}>
        Column gap + margin top
      </div>
      <div style={{ background: "#f9844a", color: "white", padding: 8 }}>
        Column gap + margin top
      </div>
    </Stack>
  </div>
);
