// ActionMenuDivider: styled(Flex) where a consumed prop (noMinWidth) is always statically true
// across all call sites. The codemod should bake minWidth:0 into the base style instead of
// creating a single-value variant lookup object.
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

export const App = () => <ActionMenuTextDivider text="Section" />;
