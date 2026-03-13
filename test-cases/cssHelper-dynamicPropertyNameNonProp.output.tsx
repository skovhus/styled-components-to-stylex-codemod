// Non-prop conditional with dynamic property-name split and multiple declarations
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

const Browser = { isSafari: true };

type StackProps = {
  column?: boolean;
  gap?: number;
  className?: string;
  children?: React.ReactNode;
};

export function Stack(props: StackProps & Omit<React.ComponentProps<"div">, "className">) {
  const { children, style, gap, column, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.stack,
          Browser.isSafari &&
            (column ? styles.stackColumnGapMarginTop(gap) : styles.stackRowGapMarginTop(gap)),
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
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
    <Stack gap={10} style={{ background: "#d6efff", padding: 8 }}>
      <div style={{ background: "#4ea8de", color: "white", padding: 8 }}>Row gap + margin top</div>
      <div style={{ background: "#4ea8de", color: "white", padding: 8 }}>Row gap + margin top</div>
    </Stack>
    <Stack column gap={12} style={{ background: "#ffe4cf", padding: 8 }}>
      <div style={{ background: "#f9844a", color: "white", padding: 8 }}>
        Column gap + margin top
      </div>
      <div style={{ background: "#f9844a", color: "white", padding: 8 }}>
        Column gap + margin top
      </div>
    </Stack>
  </div>
);

const styles = stylex.create({
  stack: {
    display: "flex",
  },
  stackColumnGapMarginTop: (gap: number | undefined) => ({
    columnGap: `${gap ?? 8}px`,
    marginTop: `${gap ?? 8}px`,
  }),
  stackRowGapMarginTop: (gap: number | undefined) => ({
    rowGap: `${gap ?? 8}px`,
    marginTop: `${gap ?? 8}px`,
  }),
});
