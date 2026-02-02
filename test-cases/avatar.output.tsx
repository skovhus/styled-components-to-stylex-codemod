import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type ImgProps = Omit<React.ComponentProps<"img">, "className" | "style"> & {
  $isInactive?: boolean;
  $disabled?: boolean;
};

function Img(props: ImgProps) {
  const { $disabled, $isInactive, ...rest } = props;
  return (
    <img
      {...rest}
      {...stylex.props(
        styles.img,
        $disabled && styles.imgDisabled,
        $isInactive && styles.imgInactive,
      )}
    />
  );
}

export const App = () => (
  <div>
    <Img src="https://picsum.photos/200" $disabled />
    <Img src="https://picsum.photos/200" />
    <br />
    <Img src="https://picsum.photos/200" $disabled $isInactive />
    <Img src="https://picsum.photos/200" $isInactive />
  </div>
);

const styles = stylex.create({
  img: {
    borderRadius: "50%",
    width: "50px",
    height: "50px",
  },
  imgDisabled: {
    filter: "opacity(0.65)",
  },
  imgInactive: {
    boxShadow: `0 0 0 1px ${$colors.bgSub}`,
    backgroundColor: $colors.bgSub,
    filter: "opacity(0.5) grayscale(1)",
  },
});
