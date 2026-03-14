import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type SharedProps = {
  highlight?: boolean;
};

export function CardA(
  props: SharedProps & Omit<React.ComponentProps<"div">, "className" | "style">,
) {
  const { children, highlight, ...rest } = props;
  return (
    <div {...rest} sx={[styles.cardA, highlight ? styles.cardAHighlight : undefined]}>
      {children}
    </div>
  );
}

export function CardB(props: SharedProps & React.ComponentProps<"div">) {
  const { className, children, style, highlight, ...rest } = props;
  return (
    <div
      {...rest}
      {...mergedSx([styles.cardB, highlight ? styles.cardBHighlight : undefined], className, style)}
    >
      {children}
    </div>
  );
}

// Non-styled wrapper with spread — causes CardB's rename to be skipped
function CardBInner(props: React.ComponentProps<typeof CardB>) {
  return <CardB {...props} />;
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 8, padding: 16 }}>
      <CardA highlight>A Highlighted</CardA>
      <CardA>A Default</CardA>
      <CardB highlight>B Highlighted</CardB>
      <CardB>B Default</CardB>
    </div>
  );
}

const styles = stylex.create({
  cardA: {
    padding: 8,
    backgroundColor: "white",
  },
  cardAHighlight: {
    backgroundColor: "yellow",
  },
  cardB: {
    padding: 8,
    backgroundColor: "white",
  },
  cardBHighlight: {
    backgroundColor: "yellow",
  },
});
