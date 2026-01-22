import * as React from "react";
import styled from "styled-components";
import { ColorConverter } from "./lib/ColorConverter";

const CardContainer = styled.label<{ checked: boolean; disabled?: boolean }>`
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border-radius: 6px;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  position: relative;
  border: 1px solid ${(props) => props.theme.color.bgSub};

  &:hover {
    border-color: ${(props) =>
      props.disabled
        ? props.theme.color.bgBase
        : props.checked
          ? props.theme.color.bgSub
          : props.theme.color.bgBase};
  }

  &:focus-within:has(:focus-visible) {
    outline-style: solid;
  }
`;

const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
`;

export const App = () => (
  <div>
    <CardContainer checked={false} disabled={false}>
      <CardContent>Option 1</CardContent>
    </CardContainer>
    <CardContainer checked={true} disabled={true}>
      <CardContent>Option 2</CardContent>
    </CardContainer>
  </div>
);
