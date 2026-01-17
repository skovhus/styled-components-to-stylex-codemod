import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type DynamicBoxProps = Omit<React.ComponentProps<"div">, "className"> & {
  $background?: string;
  $size?: string;
};

function DynamicBox(props: DynamicBoxProps) {
  const { children, style, $background, $size } = props;
  return (
    <div
      {...mergedSx(
        [
          styles.dynamicBox,
          $background != null && styles.dynamicBoxBackgroundColor($background),
          $size != null && styles.dynamicBoxHeight($size),
          $size != null && styles.dynamicBoxWidth($size),
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
    <div {...stylex.props(styles.staticBox)} />
    <DynamicBox $background="mediumseagreen" $size="100px" style={{ border: "1px solid red" }} />
  </div>
);

const styles = stylex.create({
  staticBox: {
    backgroundColor: "#BF4F74",
    height: "50px",
    width: "50px",
    borderRadius: "4px",
  },
  dynamicBox: {
    backgroundColor: "#BF4F74",
    height: "50px",
    width: "50px",
    borderRadius: "4px",
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
