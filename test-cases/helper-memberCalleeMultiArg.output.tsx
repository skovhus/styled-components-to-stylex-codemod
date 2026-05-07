import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { ColorConverter, color, mixedColor } from "./lib/helpers";

function Toggle(props: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  const { children, style } = props;
  const theme = useTheme();

  return (
    <div
      {...mergedSx(
        styles.toggle(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)),
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

type BoxProps = React.PropsWithChildren<{
  m: number;
  style?: React.CSSProperties;
}>;

function Box(props: BoxProps) {
  const { children, style, m } = props;
  const theme = useTheme();

  return (
    <div
      {...mergedSx(
        [
          styles.boxBackgroundColor(ColorConverter.cssWithAlpha(theme.color.bgBase, 0.2)),
          styles.boxMargin(m),
        ],
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

function TintedLabel(props: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  const { children, style } = props;
  const theme = useTheme();

  return (
    <span
      {...mergedSx(
        styles.tintedLabel(
          ColorConverter.cssWithAlpha(
            color("bgBase")({
              ...props,
              theme,
            }),
            0.8,
          ),
        ),
        undefined,
        style,
      )}
    >
      {children}
    </span>
  );
}

type TintedPanelProps = { faded: boolean } & Omit<React.ComponentProps<"div">, "className">;

function TintedPanel(props: TintedPanelProps) {
  const { children, style, faded } = props;
  const theme = useTheme();

  return (
    <div
      {...mergedSx(
        styles.tintedPanel(
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
        ),
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

type PlainSwatchProps = { tone: string } & Omit<React.ComponentProps<"div">, "className">;

function PlainSwatch(props: PlainSwatchProps) {
  const { children, style, tone } = props;
  return (
    <div
      {...mergedSx(
        styles.plainSwatch(ColorConverter.cssWithAlpha(props.tone, 0.4)),
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

type MixedModePanelProps = { faded: boolean } & Omit<React.ComponentProps<"div">, "className">;

function MixedModePanel(props: MixedModePanelProps) {
  const { children, style, faded } = props;
  const theme = useTheme();

  return (
    <div
      {...mergedSx(
        styles.mixedModePanel(
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
        ),
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle style={{ width: 80 }}>A</Toggle>
    <Box m={8} style={{ width: 80 }}>
      B
    </Box>
    <TintedLabel style={{ width: 80, display: "inline-block" }}>C</TintedLabel>
    <TintedPanel faded style={{ width: 80 }}>
      D
    </TintedPanel>
    <TintedPanel faded={false} style={{ width: 80 }}>
      E
    </TintedPanel>
    <PlainSwatch tone="#336699" style={{ width: 80 }}>
      F
    </PlainSwatch>
    <MixedModePanel faded style={{ width: 80 }}>
      G
    </MixedModePanel>
    <MixedModePanel faded={false} style={{ width: 80 }}>
      H
    </MixedModePanel>
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
