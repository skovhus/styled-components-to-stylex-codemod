// Imported mixin with cascade-significant overlap: base sets overflow:visible
// but TruncateText mixin sets overflow:hidden — mixin must win.
import styled from "styled-components";
import { TruncateText } from "./lib/helpers";

const ElementWithImportedMixin = styled.div`
  color: red;
  overflow: visible;
  max-width: 150px;
  padding: 8px;
  border: 1px solid gray;
  ${TruncateText}
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <ElementWithImportedMixin>
      This long text should be truncated with ellipsis because the mixin overrides overflow
    </ElementWithImportedMixin>
  </div>
);
