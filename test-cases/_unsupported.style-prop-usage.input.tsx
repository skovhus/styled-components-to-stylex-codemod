// @expected-warning: External style prop usage: styled component is used with a `style` prop in JSX which cannot be preserved
// This file should NOT be transformed because the styled component
// is used with an external `style` prop at a JSX call site.
// External style props are not supported - transforming would silently drop the style.
import styled from "styled-components";

const Box = styled.div`
  display: flex;
`;

// This usage passes a `style` prop which would be dropped after transformation
export const App = () => <Box style={{ color: "red" }}>Hello</Box>;
