import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type DynamicBoxProps = React.PropsWithChildren<{
  background?: string;
  size?: string;
  sx?: stylex.StyleXStyles;
  style?: React.CSSProperties;
}>;

function DynamicBox(props: DynamicBoxProps) {
  const { children, style, sx, background, size } = props;
  return (
    <div
      {...mergedSx(
        [
          styles.dynamicBox,
          background != null && styles.dynamicBoxBackgroundColor(background),
          size != null && styles.dynamicBoxHeight(size),
          size != null && styles.dynamicBoxWidth(size),
          sx,
        ],
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <div sx={styles.staticBox} />
    <DynamicBox background="mediumseagreen" size="100px" style={{ border: "1px solid red" }} />
  </div>
);

const styles = stylex.create({
  staticBox: {
    backgroundColor: "#BF4F74",
    height: 50,
    width: 50,
    borderRadius: 4,
  },
  dynamicBox: {
    backgroundColor: "#BF4F74",
    height: 50,
    width: 50,
    borderRadius: 4,
  },
  dynamicBoxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  dynamicBoxHeight: (height: string) => ({
    height,
  }),
  dynamicBoxWidth: (width: string) => ({
    width,
  }),
});
