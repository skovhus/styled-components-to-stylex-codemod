import * as stylex from "@stylexjs/stylex";
import React from "react";

const styles = stylex.create({
  staticBox: {
    backgroundColor: "#BF4F74",
    height: "50px",
    width: "50px",
    borderRadius: "4px",
  },
  dynamicBox: {
    borderRadius: "4px",
  },
});

interface DynamicBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  $background?: string;
  $size?: string;
}

function DynamicBox({ $background, $size, ...props }: DynamicBoxProps) {
  return (
    <div
      {...stylex.props(styles.dynamicBox)}
      style={{
        backgroundColor: $background || "#BF4F74",
        height: $size || "50px",
        width: $size || "50px",
      }}
      {...props}
    />
  );
}

export const App = () => (
  <div>
    <div {...stylex.props(styles.staticBox)} />
    <DynamicBox $background="mediumseagreen" $size="100px" />
  </div>
);
