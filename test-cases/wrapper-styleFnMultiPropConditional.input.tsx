// styled(Component)<{ A; B }> where a single CSS declaration references BOTH
// transient props in a conditional. The codemod should emit a single style fn
// with BOTH params, or destructure both. Currently it emits a fn with only one
// param while referencing the other as a dangling identifier (TS2304).
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Panel = styled(Flex)<{ $compact: boolean; $isExpanded: boolean }>`
  border-radius: 0;
  overflow-y: ${(props) => (props.$compact && props.$isExpanded ? "auto" : "hidden")};
  max-height: ${(props) => (props.$compact && props.$isExpanded ? "200px" : "none")};
  background-color: ${(props) => (props.$compact ? "transparent" : "unset")};
`;

export const App = (props: { compact: boolean; isExpanded: boolean }) => (
  <Panel $compact={props.compact} $isExpanded={props.isExpanded}>
    Content
  </Panel>
);
