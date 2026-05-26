// Optional props with `?? namedConst` fallback, referenced from multiple CSS
// properties. The fallback is applied at every call site, so the value flowing
// into each generated style fn is always a definite primitive.
//
// Regression repro: the codemod widens
// each style fn parameter to `string | undefined`, which breaks the StyleX
// callable-style signature and produces "This expression is not callable" at
// every call site, plus drops the constant base styles (e.g. `background`).
import React from "react";
import * as stylex from "@stylexjs/stylex";

const DEFAULT_GUTTER = 44;
const gutterTokens = { sticky: 8 };

type GutterBoxProps = {
  $gutter?: number;
  $zIndex?: number;
};

export function GutterBox(
  props: GutterBoxProps & Omit<React.ComponentProps<"div">, "className" | "style" | "sx">,
) {
  const { children, $gutter, $zIndex, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.gutterBox,
        styles.gutterBoxHeight(`${$gutter ?? DEFAULT_GUTTER}px`),
        styles.gutterBoxMarginBottom(`-${$gutter ?? DEFAULT_GUTTER}px`),
        styles.gutterBoxZIndex($zIndex ?? gutterTokens.sticky),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <GutterBox>Default gutter</GutterBox>
    <GutterBox $gutter={80} $zIndex={3}>
      Custom gutter
    </GutterBox>
  </div>
);

const styles = stylex.create({
  gutterBox: {
    backgroundColor: "papayawhip",
    color: "black",
    padding: 8,
  },
  gutterBoxHeight: (height: string) => ({
    height,
  }),
  gutterBoxMarginBottom: (marginBottom: string) => ({
    marginBottom,
  }),
  gutterBoxZIndex: (zIndex: number) => ({
    zIndex,
  }),
});
