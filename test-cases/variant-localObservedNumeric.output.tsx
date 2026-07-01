import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type PanelProps = { height: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

export function Panel(props: PanelProps) {
  const { height, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.panel,
        panelHeightVariants[height as keyof typeof panelHeightVariants] ??
          styles.panelHeight(height),
      ]}
    />
  );
}

type TransientPanelProps = { height: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

export function TransientPanel(props: TransientPanelProps) {
  const { height, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.transientPanel,
        transientPanelHeightVariants[height as keyof typeof transientPanelHeightVariants] ??
          styles.transientPanelHeight(height),
      ]}
    />
  );
}

type FlexiblePanelProps = { height: number | string } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

export function FlexiblePanel(props: FlexiblePanelProps) {
  const { height, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.flexiblePanel,
        flexiblePanelHeightVariants[height as keyof typeof flexiblePanelHeightVariants] ??
          styles.flexiblePanelHeight(height),
      ]}
    />
  );
}

type FaderProps = { opacity: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

export function Fader(props: FaderProps) {
  const { opacity, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.fader,
        faderOpacityVariants[opacity as keyof typeof faderOpacityVariants] ??
          styles.faderOpacity(opacity),
      ]}
    />
  );
}

type TransientFaderProps = { opacity: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

export function TransientFader(props: TransientFaderProps) {
  const { opacity, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.transientFader,
        transientFaderOpacityVariants[opacity as keyof typeof transientFaderOpacityVariants] ??
          styles.transientFaderOpacity(opacity),
      ]}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Panel height={40}>Regular 40</Panel>
    <Panel height={80}>Regular 80</Panel>
    <TransientPanel height={50}>Transient 50</TransientPanel>
    <TransientPanel height={90}>Transient 90</TransientPanel>
    <FlexiblePanel height={40}>Flexible 40</FlexiblePanel>
    <FlexiblePanel height={80}>Flexible 80</FlexiblePanel>
    <Fader opacity={0.4}>Opacity 0.4</Fader>
    <Fader opacity={0.8}>Opacity 0.8</Fader>
    <TransientFader opacity={0.5}>Transient 0.5</TransientFader>
    <TransientFader opacity={0.9}>Transient 0.9</TransientFader>
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
  flexiblePanel: {
    width: 120,
    padding: 8,
    backgroundColor: "goldenrod",
    color: "white",
  },
  flexiblePanelHeight: (height: number | string) => ({
    height: `${height}px`,
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

const flexiblePanelHeightVariants = stylex.create({
  40: {
    height: 40,
  },
  80: {
    height: 80,
  },
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
