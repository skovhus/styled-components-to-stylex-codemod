import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type PanelProps = React.PropsWithChildren<{
  height: number;
}>;

export function Panel(props: PanelProps) {
  const { children, height, ...rest } = props;
  return (
    <div {...rest} sx={styles.panel(height)}>
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
    <div {...rest} sx={styles.transientPanel(height)}>
      {children}
    </div>
  );
}

type FaderProps = { opacity: number } & Omit<React.ComponentProps<"div">, "className" | "style">;

export function Fader(props: FaderProps) {
  const { children, opacity, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.fader,
        faderOpacityVariants[opacity as keyof typeof faderOpacityVariants] ??
          styles.faderOpacity(opacity),
      ]}
    >
      {children}
    </div>
  );
}

type TransientFaderProps = { opacity: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style"
>;

export function TransientFader(props: TransientFaderProps) {
  const { children, opacity, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.transientFader,
        transientFaderOpacityVariants[opacity as keyof typeof transientFaderOpacityVariants] ??
          styles.transientFaderOpacity(opacity),
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
    <Fader opacity={0.4}>Opacity 0.4</Fader>
    <Fader opacity={0.8}>Opacity 0.8</Fader>
    <TransientFader opacity={0.5}>Transient 0.5</TransientFader>
    <TransientFader opacity={0.9}>Transient 0.9</TransientFader>
  </div>
);

const styles = stylex.create({
  panel: (height: number) => ({
    width: 120,
    padding: 8,
    backgroundColor: "tomato",
    color: "white",
    height: `${height}`,
  }),
  transientPanel: (height: number) => ({
    width: 120,
    padding: 8,
    backgroundColor: "royalblue",
    color: "white",
    height: `${height}`,
  }),
  fader: {
    width: 120,
    padding: 8,
    backgroundColor: "seagreen",
    color: "white",
  },
  faderOpacity: (opacity: number) => ({
    opacity: opacity,
  }),
  transientFader: {
    width: 120,
    padding: 8,
    backgroundColor: "rebeccapurple",
    color: "white",
  },
  transientFaderOpacity: (opacity: number) => ({
    opacity: opacity,
  }),
});

const faderOpacityVariants = stylex.create({
  0.4: {
    opacity: 0.4,
  },

  0.8: {
    opacity: 0.8,
  },
});

const transientFaderOpacityVariants = stylex.create({
  0.5: {
    opacity: 0.5,
  },

  0.9: {
    opacity: 0.9,
  },
});
