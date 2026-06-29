import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const HEADER_HEIGHT = 40;

type PanelProps = { collapsed: boolean } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// The trailing `px` must apply only to the numeric branch — appending it to the
// `calc(...)` branch would produce invalid CSS ("calc(40px + 8px)px").
export function Panel(props: PanelProps) {
  const { collapsed, ...rest } = props;
  return <div {...rest} sx={styles.panel(collapsed)} />;
}

type SpacerProps = {
  wide: boolean;
  size: number;
} & Omit<React.ComponentProps<"div">, "className" | "style" | "sx">;

// Numeric branch is a runtime prop, so the `px` suffix stays on that branch.
export function Spacer(props: SpacerProps) {
  const { wide, size, ...rest } = props;
  return <div {...rest} sx={styles.spacer(wide, size)} />;
}

// Only the numeric branches are rendered for visual comparison: the original
// styled-components input emits invalid CSS for the `calc(...)` branch (the
// trailing `px` corrupts it), so input and output cannot render identically
// there. The codemod still transforms that branch correctly (see .output.tsx).
export const App = () => (
  <div style={{ display: "flex", gap: "8px" }}>
    <Panel collapsed={false}>Header height</Panel>
    <Spacer wide={false} size={48}>
      Fixed size
    </Spacer>
  </div>
);

const styles = stylex.create({
  panel: (collapsed: boolean) => ({
    backgroundColor: "lightblue",
    height: collapsed ? `calc(${HEADER_HEIGHT}px + 8px)` : HEADER_HEIGHT,
  }),
  spacer: (wide: boolean, size: number) => ({
    backgroundColor: "lightgreen",
    width: wide ? `calc(100% - ${size}px)` : size,
  }),
});
