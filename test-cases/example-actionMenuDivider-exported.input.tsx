// ActionMenuDivider: exported styled(Flex) where noMinWidth is always passed at local call sites.
// Because the component is exported, external callers may omit or vary the prop, so singleton
// folding must NOT bake it into the base style — it should remain a variant.
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
