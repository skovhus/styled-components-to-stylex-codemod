import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>;

export function Container(props: ContainerProps) {
  const { children, align, as, column, direction, gap, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.container)}>
      {children}
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "4px",
    backgroundColor: "#f4f4ff",
  },
});
