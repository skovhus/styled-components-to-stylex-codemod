import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type HoverSwatchProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $tone: string;
};

/**
 * Template literal interpolation inside pseudo/media should stay scoped
 * when preserved via a StyleX style function.
 */
function HoverSwatch(props: HoverSwatchProps) {
  const { children, $tone } = props;
  return (
    <div
      {...stylex.props(
        styles.hoverSwatch,
        styles.hoverSwatchColor({
          $tone,
        }),
      )}
    >
      {children}
    </div>
  );
}

type HoverMediaSwatchProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $tone: string;
};

function HoverMediaSwatch(props: HoverMediaSwatchProps) {
  const { children, $tone } = props;
  return (
    <div
      {...stylex.props(
        styles.hoverMediaSwatch,
        styles.hoverMediaSwatchColor({
          $tone,
        }),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <HoverSwatch $tone="tomato">Hover</HoverSwatch>
    <HoverMediaSwatch $tone="plum">Hover Media</HoverMediaSwatch>
  </div>
);

const styles = stylex.create({
  hoverSwatch: {
    display: "inline-block",
  },
  hoverSwatchColor: (props) => ({
    color: {
      default: null,
      ":hover": `var(--tone, ${props.$tone})`,
    },
  }),
  hoverMediaSwatch: {
    display: "inline-block",
  },
  hoverMediaSwatchColor: (props) => ({
    color: {
      default: null,
      ":hover": {
        default: null,
        "@media (hover: hover)": `var(--tone, ${props.$tone})`,
      },
    },
  }),
});
