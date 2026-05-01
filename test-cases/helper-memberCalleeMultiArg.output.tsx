import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { ColorConverter, color, mixedColor } from "./lib/helpers";

function Toggle(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return (
    <div sx={styles.toggle(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4))}>
      {props.children}
    </div>
  );
}

type BoxProps = React.PropsWithChildren<{
  m: number;
}>;

function Box(props: BoxProps) {
  const { children, m } = props;
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.boxBackgroundColor(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.2)),
        styles.boxMargin(m),
      ]}
    >
      {children}
    </div>
  );
}

function TintedLabel(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <span
      sx={styles.tintedLabel(
        ColorConverter.cssWithAlpha(
          color("bgBase")({
            ...props,
            theme,
          }),
          0.8,
        ),
      )}
    >
      {props.children}
    </span>
  );
}

type TintedPanelProps = React.PropsWithChildren<{
  faded: boolean;
}>;

function TintedPanel(props: TintedPanelProps) {
  const { children, faded } = props;
  const theme = useTheme();

  return (
    <div
      sx={styles.tintedPanel(
        props.faded
          ? ColorConverter.cssWithAlpha(
              color("bgBase")({
                ...props,
                theme,
              }),
              0.8,
            )
          : color("bgBase")({
              ...props,
              theme,
            }),
      )}
    >
      {children}
    </div>
  );
}

type PlainSwatchProps = React.PropsWithChildren<{
  tone: string;
}>;

function PlainSwatch(props: PlainSwatchProps) {
  const { children, tone } = props;
  return (
    <div sx={styles.plainSwatch(ColorConverter.cssWithAlpha(props.tone, 0.4))}>{children}</div>
  );
}

type MixedModePanelProps = React.PropsWithChildren<{
  faded: boolean;
}>;

function MixedModePanel(props: MixedModePanelProps) {
  const { children, faded } = props;
  const theme = useTheme();

  return (
    <div
      sx={styles.mixedModePanel(
        ColorConverter.cssWithAlpha(
          props.faded
            ? mixedColor(
                "bgBase",
                "theme",
              )({
                ...props,
                theme,
              })
            : mixedColor("bgSub"),
          0.7,
        ),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle>Toggle</Toggle>
    <Box m={8}>Box with margin</Box>
    <TintedLabel>Label with nested color helper</TintedLabel>
    <TintedPanel faded>Faded panel</TintedPanel>
    <TintedPanel faded={false}>Solid panel</TintedPanel>
    <PlainSwatch tone="#336699">Plain swatch</PlainSwatch>
    <MixedModePanel faded>Faded mixed panel</MixedModePanel>
    <MixedModePanel faded={false}>Direct mixed panel</MixedModePanel>
  </div>
);

const styles = stylex.create({
  toggle: (backgroundColor: string) => ({
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor,
  }),
  boxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  boxMargin: (margin: number) => ({
    margin: `${margin}px`,
  }),
  tintedLabel: (backgroundColor: string) => ({
    paddingBlock: 2,
    paddingInline: 6,
    backgroundColor,
  }),
  tintedPanel: (backgroundColor: string) => ({
    padding: 4,
    backgroundColor,
  }),
  plainSwatch: (backgroundColor: string) => ({
    padding: 4,
    backgroundColor,
  }),
  mixedModePanel: (backgroundColor: string) => ({
    padding: 4,
    backgroundColor,
  }),
});
