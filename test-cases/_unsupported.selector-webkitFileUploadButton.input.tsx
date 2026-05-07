// @expected-warning: Unsupported selector: unsupported pseudo-element
// StyleX does not support styling the file upload button pseudo-element.
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
