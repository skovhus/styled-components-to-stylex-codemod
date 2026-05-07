// Vendor file-upload button pseudo-element should be converted; the StyleX compiler emits this CSS.
// The eslint rule currently reports this selector as unknown, so the fixture has a local lint
// override instead of treating a linter false positive as unsupported syntax.
import styled from "styled-components";

const FileInput = styled.input.attrs({ type: "file" })`
  display: none;
  visibility: hidden;

  &::-webkit-file-upload-button {
    display: none;
    visibility: hidden;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <FileInput />
  </div>
);
