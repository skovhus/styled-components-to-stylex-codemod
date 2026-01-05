import React from "react";
import styled from "styled-components";
import "./css-variables.css";
import { transitionSpeed } from "./lib/helpers.ts";

const AnimatedPath = styled.path`
  transition-property: opacity;
  transition-duration: ${transitionSpeed("slowTransition")};
  stroke: #bf4f74;
  stroke-width: 6px;
  fill: none;
`;

export const App = () => {
  const [on, setOn] = React.useState(false);

  React.useEffect(() => {
    const id = window.setInterval(() => setOn((v) => !v), 650);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <svg
        width="140"
        height="60"
        viewBox="0 0 140 60"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          background: "white",
        }}
      >
        <AnimatedPath d="M10 30 L130 30" style={{ opacity: on ? 1 : 0.2 }} />
      </svg>
    </div>
  );
};
