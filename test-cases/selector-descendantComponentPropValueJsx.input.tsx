import React from "react";
import styled from "styled-components";

const Icon = styled.svg`
  width: 24px;
  height: 24px;
  fill: #bf4f74;
  transition: fill 0.25s;
`;

const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: papayawhip;
  color: #bf4f74;

  &:hover ${Icon} {
    fill: rebeccapurple;
  }
`;

function Holder(props: { icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{props.children}</div>
  );
}

export const App = () => (
  <div>
    <Trigger>
      <Holder
        icon={
          <Icon viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </Icon>
        }
      >
        Hover me
      </Holder>
      <Icon viewBox="0 0 20 20">
        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
      </Icon>
    </Trigger>
  </div>
);
