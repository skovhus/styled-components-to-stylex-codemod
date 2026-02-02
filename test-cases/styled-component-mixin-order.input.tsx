import styled from "styled-components";
import { TruncateText } from "./lib/helpers";

// Local mixin
const LocalMixin = styled.span`
  font-weight: bold;
`;

// Test case 1: Local first, then imported
// Order should be: localMixin, helpers.truncate, combined
const LocalThenImported = styled.div`
  color: red;
  ${LocalMixin}
  ${TruncateText}
`;

// Test case 2: Imported first, then local
// Order should be: helpers.truncate, localMixin, combined2
const ImportedThenLocal = styled.div`
  color: blue;
  ${TruncateText}
  ${LocalMixin}
`;

export const App = () => (
  <div>
    <LocalThenImported>Local then imported</LocalThenImported>
    <ImportedThenLocal>Imported then local</ImportedThenLocal>
  </div>
);
