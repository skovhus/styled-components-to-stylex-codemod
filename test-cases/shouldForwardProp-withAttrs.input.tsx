// withConfig shouldForwardProp combined with attrs function defaults
import styled from "styled-components";

interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  align?: "left" | "center" | "right";
  selectable?: boolean;
}

// This chain is silently not recognized: styled("span").withConfig(...).attrs(fn)
// The codemod produces no output and no warning.
export const Text = styled("span")
  .withConfig({
    shouldForwardProp: (prop) => !["align", "selectable"].includes(prop),
  })
  .attrs<TextProps>((props) => ({
    align: props.align ?? "left",
    selectable: props.selectable ?? false,
  }))<TextProps>`
  font-style: normal;
  ${(props) => (props.align ? `text-align: ${props.align};` : "")}
  ${(props) => (props.selectable ? "user-select: text;" : "")};
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <Text>Default left, not selectable</Text>
      <Text align="center">Centered</Text>
      <Text selectable>Selectable</Text>
    </div>
  );
}
