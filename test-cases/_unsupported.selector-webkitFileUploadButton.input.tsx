// @expected-warning: Unsupported selector: unsupported pseudo-element
//
// StyleX's pseudo-element allowlist includes the standard `::file-selector-button`, but not the
// vendor `::-webkit-file-upload-button` selector used here. Rewriting the vendor selector to the
// standard selector may be acceptable in the future, but that is a deliberate compatibility choice;
// for now the codemod bails rather than silently changing browser-targeting semantics.
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
