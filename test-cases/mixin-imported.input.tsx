import styled from "styled-components";
import { TruncateText } from "./lib/helpers";

const ElementWithImportedMixin = styled.div`
  color: red;
  ${TruncateText}
`;

export const App = () => (
  <ElementWithImportedMixin>Red with imported mixin</ElementWithImportedMixin>
);
