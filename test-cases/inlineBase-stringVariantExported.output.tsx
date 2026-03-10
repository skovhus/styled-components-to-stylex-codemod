import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type CardProps = { direction?: keyof typeof cardDirectionVariants } & {
  sx?: stylex.StyleXStyles;
} & Pick<React.ComponentProps<"div">, "className" | "style" | "ref" | "children">;

export function Card(props: CardProps) {
  const { className, children, style, sx, direction, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [styles.card, direction != null && cardDirectionVariants[direction], sx],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Card>Default row</Card>
      <Card direction="column">Column card</Card>
    </div>
  );
}

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "row",
    padding: "12px",
    backgroundColor: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ddd",
  },
});

const cardDirectionVariants = stylex.create({
  column: {
    flexDirection: "column",
  },
});
