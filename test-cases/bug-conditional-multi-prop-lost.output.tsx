import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Bug: Two separate conditional interpolations (width and height) are collapsed into
// a single style function that only contains `height`. The `width` branch is lost
// entirely, so `Spacer width={100}` has no effect. Causes TS2353.

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

type SpacerProps = Omit<React.ComponentProps<"div">, "className"> & Props;

export function Spacer(props: SpacerProps) {
  const { children, style, width, height, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          showProperty(props.width)
            ? styles.spacerCondTruthyWidth({
                width: props.width,
              })
            : undefined,
          showProperty(props.height)
            ? styles.spacerCondTruthyHeight({
                height: props.height,
              })
            : undefined,
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
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Spacer width={100} height={50} style={{ background: "#cce5ff" }} />
    <Spacer width="2rem" style={{ background: "#d4edda", height: 20 }} />
    <Spacer height={0} style={{ background: "#fff3cd", width: 40 }} />
    <Spacer style={{ background: "#f8d7da", width: 20, height: 20 }} />
  </div>
);

const styles = stylex.create({
  spacerCondTruthyWidth: (props: { width: number | string | undefined }) => ({
    width: getSize(props.width),
  }),
  spacerCondTruthyHeight: (props: { height: number | string | undefined }) => ({
    height: getSize(props.height),
  }),
});
