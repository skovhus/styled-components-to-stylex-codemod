import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type ImgProps = {
  isInactive?: boolean;
  disabled?: boolean;
} & Pick<React.ComponentProps<"img">, "src">;

function Img(props: ImgProps) {
  const { disabled, isInactive, ...rest } = props;

  return (
    <img
      {...rest}
      sx={[
        styles.img,
        disabled ? styles.imgDisabled : undefined,
        isInactive ? styles.imgInactive : undefined,
      ]}
    />
  );
}

export const App = () => (
  <div>
    <Img src="https://picsum.photos/200" disabled />
    <Img src="https://picsum.photos/200" />
    <br />
    <Img src="https://picsum.photos/200" disabled isInactive />
    <Img src="https://picsum.photos/200" isInactive />
  </div>
);

const styles = stylex.create({
  img: {
    borderRadius: "50%",
    width: 50,
    height: 50,
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
