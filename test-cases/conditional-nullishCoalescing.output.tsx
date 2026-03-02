import React from "react";
import * as stylex from "@stylexjs/stylex";

type DividerProps = Omit<React.ComponentProps<"hr">, "className" | "style"> & {
  $color?: string;
};

// Styled hr
function Divider(props: DividerProps) {
  const { $color } = props;

  return (
    <hr
      {...stylex.props(styles.divider, $color != null && styles.dividerBackgroundColor($color))}
    />
  );
}

export const App = () => (
  <div>
    <Divider />
    <Divider $color="#bf4f74" />
  </div>
);

const styles = stylex.create({
  divider: {
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    height: "1px",
    backgroundColor: "#e0e0e0",
    marginBlock: "16px",
    marginInline: 0,
  },
  dividerBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
