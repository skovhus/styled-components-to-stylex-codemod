import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

type SpacerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & Props;

export function Spacer(props: SpacerProps) {
  const { children, width, height, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        showProperty(props.width)
          ? styles.spacerCondTruthy({
              width: props.width,
            })
          : undefined,
        showProperty(props.height)
          ? styles.spacerCondTruthy({
              height: props.height,
            })
          : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Spacer width={100} height={50} />
    <Spacer width="2rem" />
    <Spacer height={0} />
    <Spacer />
  </div>
);

const styles = stylex.create({
  spacerCondTruthy: (props: { height: number }) => ({
    height: getSize(props.height),
  }),
});
