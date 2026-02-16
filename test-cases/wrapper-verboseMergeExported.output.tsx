import * as stylex from "@stylexjs/stylex";
import React from "react";

type LoadingProps = {
  delay?: number;
};

function Loading(props: LoadingProps) {
  return <div>Loading...</div>;
}

// Exported styled component with external styles enabled will destructure className/style
export function StyledLoading(
  props: React.ComponentPropsWithRef<typeof Loading> & {
    className?: string;
    style?: React.CSSProperties;
  },
) {
  const { className, style, ...rest } = props;

  const sx = stylex.props(styles.loading);

  const sxMerged = {
    ...sx,
    className: [sx.className, className].filter(Boolean).join(" "),

    style: {
      ...sx.style,
      ...style,
    },
  };

  return <Loading {...rest} {...sxMerged} />;
}

export const App = () => <StyledLoading delay={1000} />;

const styles = stylex.create({
  loading: {
    height: "100%",
  },
});
