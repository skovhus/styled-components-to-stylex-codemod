import styled from "styled-components";
import { ExternalComponent } from "./lib/external-component";
import type { ImportedSizeProps } from "./lib/imported-size-props";

// This uses styleFnFromProps pattern - prop value is directly used as style value
const StyledExternal = styled(ExternalComponent)<{ $color?: string; $padding?: string }>`
  color: ${(props) => props.$color || "gray"};
  padding: ${(props) => props.$padding || "10px"};
`;

// The TypeScript prepass resolves this imported optional prop type, so the output
// can guard the dynamic style call and avoid treating the numeric prop as string.
const SizedExternal = styled(ExternalComponent)<ImportedSizeProps>`
  width: ${(props) => props.tabIndex};
`;

export function App() {
  return (
    <div>
      <StyledExternal $color="blue" $padding="20px" isOpen />
      <StyledExternal isOpen={false} />
      <SizedExternal tabIndex={24} isOpen />
      <SizedExternal isOpen={false} />
    </div>
  );
}
