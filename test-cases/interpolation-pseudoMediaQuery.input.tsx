import styled from "styled-components";
import { highlightMedia } from "./lib/helpers";

/**
 * Interpolated pseudo-class selector resolved via `pseudoMediaQuery`.
 * Uses CSS `@media (hover: hover/none)` to guard each pseudo, avoiding JS runtime.
 * All properties go into a single style object with nested pseudo + media.
 */
const Card = styled.div`
  color: blue;
  padding: 16px;

  &:${highlightMedia} {
    color: red;
    background-color: yellow;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Card>Media Query Card</Card>
  </div>
);
