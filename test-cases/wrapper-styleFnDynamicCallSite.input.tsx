// styled(Component)<{ prop: number }> with a dynamic style function whose value
// can't be inlined at the call site — the wrapper must destructure `prop` (or
// reference props.prop) when calling the dynamic style function. Currently the
// codemod emits a bare identifier `prop` while not destructuring it (TS2304).
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Layout = styled(Flex)<{ windowHeight: number }>`
  margin-top: ${(props) => (props.windowHeight - 400) / 2}px;
`;

export const App = (props: { windowHeight: number }) => (
  <Layout windowHeight={props.windowHeight}>Content</Layout>
);
