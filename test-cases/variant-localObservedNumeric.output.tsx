import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type PanelProps = { height: number } & Omit<React.ComponentProps<"div">, "className" | "style">;

export function Panel(props: PanelProps) {
  const { children, height, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.panel,
        panelHeightVariants[height as keyof typeof panelHeightVariants] ??
          styles.panelHeight(height),
      ]}
    >
      {children}
    </div>
  );
}

type TransientPanelProps = { height: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style"
>;

export function TransientPanel(props: TransientPanelProps) {
  const { children, height, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.transientPanel,
        transientPanelHeightVariants[height as keyof typeof transientPanelHeightVariants] ??
          styles.transientPanelHeight(height),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Panel height={40}>Regular 40</Panel>
    <Panel height={80}>Regular 80</Panel>
    <TransientPanel height={50}>Transient 50</TransientPanel>
    <TransientPanel height={90}>Transient 90</TransientPanel>
  </div>
);

const styles = stylex.create({
  panel: {
    width: 120,
    padding: 8,
    backgroundColor: "tomato",
    color: "white",
  },
  panelHeight: (height: number) => ({
    height: height,
  }),
  transientPanel: {
    width: 120,
    padding: 8,
    backgroundColor: "royalblue",
    color: "white",
  },
  transientPanelHeight: (height: number) => ({
    height: height,
  }),
});

const panelHeightVariants = stylex.create({
  40: {
    height: 40,
  },
  80: {
    height: 80,
  },
});

const transientPanelHeightVariants = stylex.create({
  50: {
    height: 50,
  },
  90: {
    height: 90,
  },
});
