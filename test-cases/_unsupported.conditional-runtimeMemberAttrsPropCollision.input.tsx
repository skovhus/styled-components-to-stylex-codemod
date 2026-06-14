// @expected-warning: Imported runtime condition root collides with a component prop of the same name
// The imported runtime condition root `browser` collides with a component prop
// `browser` that is read inside an `.attrs()` callback. The collision guard must
// include attrs-derived prop names; otherwise the wrapper would destructure
// `browser` from props and shadow the import — bail.
import styled from "styled-components";
import { Browser as browser } from "./lib/helpers";

const Box = styled.div.attrs((props: { browser?: number }) => ({
  tabIndex: props.browser,
}))<{ browser?: number }>`
  position: relative;
  top: ${browser.isTouchDevice ? 5 : 1}px;
`;

export const App = () => <Box>Attrs prop collision</Box>;
