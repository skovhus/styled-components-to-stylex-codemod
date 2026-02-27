// ActionMenuDivider: exported styled(Flex) where noMinWidth is always passed at local call sites.
// The adapter returns { styles: false, as: false } for this component, so it has no external
// interface. Singleton folding is safe — noMinWidth is baked into the base style with narrow props.
import * as React from "react";
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const TextDividerContainer = styled(Flex)`
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

export const App = () => <ActionMenuTextDivider text="Section" />;
