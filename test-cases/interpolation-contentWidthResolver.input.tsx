// Imported constant used as interpolation value (resolver must be called)
import styled from "styled-components";
import { CONTENT_MAX_WIDTH } from "./lib/layout";

export const Layout = styled.div`
  position: relative;
  max-width: ${CONTENT_MAX_WIDTH};
`;

export function App() {
  return <Layout>Content</Layout>;
}
