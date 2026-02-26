// Destructured defaults in template-literal declarations should be preserved
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type TileProps = Omit<React.ComponentProps<"div">, "className"> & {
  gap?: number;
  className?: string;
  children?: React.ReactNode;
};

export function Tile(props: TileProps) {
  const { children, style, gap, ...rest } = props;

  return (
    <div {...rest} {...mergedSx([styles.tile, styles.tileGap(`${gap ?? 8}px`)], undefined, style)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
    <Tile style={{ background: "#e2f0ff", padding: 8 }}>
      <span style={{ background: "#4f83cc", color: "white", padding: 8 }}>Default gap</span>
      <span style={{ background: "#4f83cc", color: "white", padding: 8 }}>Default gap</span>
    </Tile>
    <Tile gap={14} style={{ background: "#ffeecf", padding: 8 }}>
      <span style={{ background: "#f9a825", color: "white", padding: 8 }}>Gap 14</span>
      <span style={{ background: "#f9a825", color: "white", padding: 8 }}>Gap 14</span>
    </Tile>
  </div>
);

const styles = stylex.create({
  tile: {
    display: "inline-flex",
  },
  tileGap: (gap: string) => ({
    gap,
  }),
});
