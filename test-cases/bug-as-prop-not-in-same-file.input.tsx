import styled from "styled-components";
import { Text } from "./lib/text";

// Bug: styled(Text) always supports the `as` prop for polymorphism, but the codemod
// only adds `as` to the wrapper type when it detects `as` usage in the same file.
// Exported components used with `as` in other files lose polymorphism. Causes TS2322.

export const HeaderTitle = styled(Text)`
  font-size: 24px;
  font-weight: 600;
`;

export const App = () => (
  <div>
    <HeaderTitle variant="large">Default Title</HeaderTitle>
  </div>
);
