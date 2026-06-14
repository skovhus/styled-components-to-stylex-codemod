import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

type JsonTextareaProps = { hasError?: boolean } & Omit<
  React.ComponentProps<"textarea">,
  "className" | "style" | "sx"
>;

function JsonTextarea(props: JsonTextareaProps) {
  const { hasError, ...rest } = props;
  return <textarea {...rest} sx={[styles.jsonTextarea, hasError && styles.jsonTextareaHasError]} />;
}

type HoverSwatchProps = React.PropsWithChildren<{
  hoverColor: string;
}>;

// Prop-valued dynamic declaration inside a pseudo-class:
// the :hover gating must be preserved and the static base folded into `default`
function HoverSwatch(props: HoverSwatchProps) {
  const { children, hoverColor } = props;
  return <button sx={styles.hoverSwatch(hoverColor)}>{children}</button>;
}

type OptionalHoverSwatchProps = React.PropsWithChildren<{
  hoverColor?: string;
}>;

// Same pattern but with an OPTIONAL prop: the folded `slategray` base must be
// preserved when the prop is absent. The style function therefore must be
// invoked unconditionally (not `prop != null && fn(prop)`), passing undefined.
function OptionalHoverSwatch(props: OptionalHoverSwatchProps) {
  const { children, hoverColor } = props;
  return <button sx={styles.optionalHoverSwatch(hoverColor)}>{children}</button>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <JsonTextarea defaultValue="default" />
    <JsonTextarea hasError defaultValue="error" />
    <HoverSwatch hoverColor="tomato">Hover me (tomato)</HoverSwatch>
    <HoverSwatch hoverColor="seagreen">Hover me (seagreen)</HoverSwatch>
    <OptionalHoverSwatch>No hover prop (stays slategray)</OptionalHoverSwatch>
    <OptionalHoverSwatch hoverColor="rebeccapurple">Hover me (purple)</OptionalHoverSwatch>
  </div>
);

const styles = stylex.create({
  jsonTextarea: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: {
      default: $colors.bgBorderFaint,
      ":focus": $colors.controlPrimary,
    },
    borderRadius: 6,
    outline: {
      default: null,
      ":focus": "none",
    },
  },
  jsonTextareaHasError: {
    borderColor: {
      default: $colors.greenBase,
      ":focus": $colors.greenBase,
    },
  },
  hoverSwatch: (backgroundColor: string) => ({
    paddingBlock: 8,
    paddingInline: 16,
    color: "white",
    backgroundColor: {
      default: "slategray",
      ":hover": backgroundColor,
    },
  }),
  optionalHoverSwatch: (backgroundColor: string | undefined) => ({
    paddingBlock: 8,
    paddingInline: 16,
    color: "white",
    backgroundColor: {
      default: "slategray",
      ":hover": backgroundColor,
    },
  }),
});
