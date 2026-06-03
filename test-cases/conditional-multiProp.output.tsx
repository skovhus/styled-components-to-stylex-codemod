import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type Props = {
  width?: number | string;
  height?: number | string;
};

const getSize = (size?: number | string) => {
  if (!size || typeof size === "number") {
    return `${size}px`;
  }
  return size;
};

const showProperty = (size?: number | string) => {
  return !!size || size === 0;
};

export function Spacer(
  props: Props & Omit<React.ComponentProps<"div">, "className"> & { sx?: stylex.StyleXStyles },
) {
  const { style, sx, width, height, ...rest } = props;
  return (
    <div
      {...rest}
      {...mergedSx(
        [
          width != null && widthVariants[width as keyof typeof widthVariants],
          height != null && heightVariants[height as keyof typeof heightVariants],
          sx,
        ],
        undefined,
        style,
      )}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Spacer width={100} height={50} style={{ background: "#cce5ff" }} />
    <Spacer width="2rem" style={{ background: "#d4edda", height: 20 }} />
    <Spacer height={0} style={{ background: "#fff3cd", width: 40 }} />
    <Spacer style={{ background: "#f8d7da", width: 20, height: 20 }} />
  </div>
);

const widthVariants = stylex.create({
  100: {
    width: "100px",
  },
  "2rem": {
    width: "2rem",
  },
});

const heightVariants = stylex.create({
  0: {
    height: "0px",
  },
  50: {
    height: "50px",
  },
});
