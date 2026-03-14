import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type HoverSwatchProps = React.PropsWithChildren<{
  tone: string;
}>;

/**
 * Template literal interpolation inside pseudo/media should stay scoped
 * when preserved via a StyleX style function.
 */
function HoverSwatch(props: HoverSwatchProps) {
  const { children, tone } = props;
  return <div sx={[styles.hoverSwatch, styles.hoverSwatchColor(props)]}>{children}</div>;
}

type HoverMediaSwatchProps = React.PropsWithChildren<{
  tone: string;
}>;

function HoverMediaSwatch(props: HoverMediaSwatchProps) {
  const { children, tone } = props;
  return <div sx={[styles.hoverMediaSwatch, styles.hoverMediaSwatchColor(props)]}>{children}</div>;
}

export const App = () => (
  <div>
    <HoverSwatch tone="tomato">Hover</HoverSwatch>
    <HoverMediaSwatch tone="plum">Hover Media</HoverMediaSwatch>
  </div>
);

const styles = stylex.create({
  hoverSwatch: {
    display: "inline-block",
  },
  hoverSwatchColor: (props: HoverSwatchProps) => ({
    color: {
      default: null,
      ":hover": `var(--tone, ${props.tone})`,
    },
  }),
  hoverMediaSwatch: {
    display: "inline-block",
  },
  hoverMediaSwatchColor: (props: HoverMediaSwatchProps) => ({
    color: {
      default: null,
      ":hover": {
        default: null,
        "@media (hover: hover)": `var(--tone, ${props.tone})`,
      },
    },
  }),
});
