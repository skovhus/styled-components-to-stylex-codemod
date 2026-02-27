// ActionMenuDivider: noMinWidth is NOT passed at every call site, so it cannot be folded
// into the base style. It becomes a boolean conditional style in the main styles object.
import * as React from "react";
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const TextDividerContainer = styled(Flex)`
  user-select: none;
  height: 30px;
  padding: 4px 12px 0px 14px;
  align-items: center;
`;

type ActionMenuTextDividerProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
};

function ActionMenuTextDivider(props: ActionMenuTextDividerProps) {
  return (
    <TextDividerContainer noMinWidth className={props.className} style={props.style}>
      <span>{props.text}</span>
    </TextDividerContainer>
  );
}

// Second call site without noMinWidth — prevents folding
function ActionMenuTextDividerWide(props: ActionMenuTextDividerProps) {
  return (
    <TextDividerContainer className={props.className} style={props.style}>
      <span>{props.text}</span>
    </TextDividerContainer>
  );
}

export const App = () => (
  <>
    <ActionMenuTextDivider text="Narrow" />
    <ActionMenuTextDividerWide text="Wide" />
  </>
);
