import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { calcVars } from "./css-calc.stylex";

function FlexItem(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.flexItem}>{props.children}</div>;
}

type NegativeOffsetProps = React.PropsWithChildren<{
  size?: number;
}>;

function NegativeOffset(props: NegativeOffsetProps) {
  const { children, size } = props;
  return (
    <div
      sx={[
        styles.negativeOffset,
        styles.negativeOffsetHeight(`${size ?? 44}px`),
        styles.negativeOffsetMarginBottom(`-${size ?? 44}px`),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div sx={styles.container}>
    <div sx={styles.grid}>
      <FlexItem>Item 1</FlexItem>
      <FlexItem>Item 2</FlexItem>
    </div>
    <aside sx={styles.sidebar}>Sidebar content</aside>
    <div sx={styles.complexCalc}>Complex calc</div>
    <div sx={styles.withVariables}>With variables</div>
    <div
      sx={styles.withCssFunctions({
        dynamicHeight: "300px",
      })}
    >
      CSS functions
    </div>
    <NegativeOffset size={32}>Negative offset</NegativeOffset>
  </div>
);

const styles = stylex.create({
  container: {
    width: "calc(100% - 40px)",
    maxWidth: "calc(1200px - 2rem)",
    marginBlock: 0,
    marginInline: "auto",
    padding: "calc(16px + 1vw)",
  },
  sidebar: {
    width: "calc(25% - 20px)",
    minWidth: "calc(200px + 2vw)",
    height: "calc(100vh - 60px)",
    padding: "calc(8px * 2)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, calc(33.333% - 20px))",
    gap: "calc(10px + 0.5vw)",
  },
  flexItem: {
    flex: "0 0 calc(50% - 1rem)",
    padding: "calc(1rem / 2)",
  },
  // Nested calc
  complexCalc: {
    width: "calc(100% - calc(20px + 2rem))",
    margin: "calc(10px + calc(5px * 2))",
  },
  // Calc with CSS variables
  withVariables: {
    width: `calc(${calcVars.baseSize} * 10)`,
    padding: `calc(${calcVars.baseSize} / 2)`,
  },
  // Interpolated expressions inside CSS math functions
  withCssFunctions: (props: { dynamicHeight: string }) => ({
    padding: 8,
    backgroundColor: "lightblue",
    height: `max(100px, ${props.dynamicHeight})`,
  }),
  negativeOffset: {
    height: "44px",
    marginBottom: "-44px",
    backgroundColor: "lavender",
  },
  negativeOffsetHeight: (height: string) => ({
    height,
  }),
  negativeOffsetMarginBottom: (marginBottom: string) => ({
    marginBottom,
  }),
});
