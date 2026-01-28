import styled from "styled-components";
import { ExternalComponent } from "./lib/external-component";

// Spread props require wrapper - styleFn values can't be extracted at transform time
const StyledExternal = styled(ExternalComponent)<{ $color?: string }>`
  color: ${(props) => props.$color || "gray"};
  padding: 10px;
`;

export function App(props: { $color?: string; isOpen: boolean }) {
  return <StyledExternal {...props} />;
}
