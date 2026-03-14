import React from "react";
import * as stylex from "@stylexjs/stylex";

type DividerProps = {
  color?: string;
};

// Styled hr
function Divider(props: DividerProps) {
  const { color } = props;
  return <hr sx={[styles.divider, color != null && styles.dividerBackgroundColor(color)]} />;
}

type FadeBoxProps = React.PropsWithChildren<{
  delay?: number;
}>;

// Nullish coalescing with numeric fallback and unit suffix
function FadeBox(props: FadeBoxProps) {
  const { children, delay } = props;

  return (
    <div
      sx={styles.fadeBox({
        transitionDelay: `${delay ?? 0}ms`,
      })}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Divider />
    <Divider color="#bf4f74" />
    <FadeBox>Default delay</FadeBox>
    <FadeBox delay={100}>Custom delay</FadeBox>
  </div>
);

const styles = stylex.create({
  divider: {
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    height: 1,
    backgroundColor: "#e0e0e0",
    marginBlock: 16,
    marginInline: 0,
  },
  dividerBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  fadeBox: (props: { transitionDelay: string }) => ({
    transitionProperty: "opacity",
    transitionDuration: "200ms",
    transitionTimingFunction: "ease-out",
    transitionDelay: props.transitionDelay,
  }),
});
