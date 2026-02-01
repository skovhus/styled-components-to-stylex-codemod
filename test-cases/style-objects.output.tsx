import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type DynamicBoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $background?: string;
  $size?: string;
};

function DynamicBox(props: DynamicBoxProps) {
  const { children, $background, $size } = props;
  return (
    <div
      {...stylex.props(
        styles.dynamicBox,
        $background != null && styles.dynamicBoxBackgroundColor($background),
        $size != null && styles.dynamicBoxHeight($size),
        $size != null && styles.dynamicBoxWidth($size),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <div {...stylex.props(styles.staticBox)} />
    <DynamicBox $background="mediumseagreen" $size="100px" />
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
