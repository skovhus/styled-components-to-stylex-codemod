import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type TintedBoxProps<C extends React.ElementType = "div"> = Omit<
  {
    tint: string;
  },
  "as"
> &
  Omit<React.ComponentPropsWithRef<C>, "tint"> & { sx?: stylex.StyleXStyles; as?: C };

// Extending a base with dynamic (prop-consuming) styles: the base must stay a
// wrapper (it strips $tint from the DOM), so the extension delegates through
// the wrapper's sx prop — its overrides merge after the base's dynamic styles
function TintedBox<C extends React.ElementType = "div">(props: TintedBoxProps<C>) {
  const { as: Component = "div", className, style, sx, tint, ...rest } = props;
  return <Component {...rest} {...mergedSx([styles.tintedBox(tint), sx], className, style)} />;
}

export const App = () => (
  <div>
    <button sx={styles.button}>Normal Button</button>
    <button sx={[styles.button, styles.tomatoButton]}>Tomato Button</button>
    <TintedBox tint="crimson">Tinted (4px padding)</TintedBox>
    <TintedBox tint="seagreen" sx={styles.bigTintedBox}>
      Big tinted (16px padding)
    </TintedBox>
  </div>
);

const styles = stylex.create({
  button: {
    display: "flex",
    color: "#bf4f74",
    fontSize: "1em",
    margin: "1em",
    paddingBlock: "0.25em",
    paddingInline: "1em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#bf4f74",
    borderRadius: 3,
  },
  tomatoButton: {
    color: "tomato",
    borderColor: "tomato",
    display: {
      default: "flex",
      "@media print": "block",
    },
  },
  tintedBox: (color: string) => ({
    padding: 4,
    backgroundColor: "#f0f0f0",
    color,
  }),
  bigTintedBox: {
    padding: 16,
  },
});
