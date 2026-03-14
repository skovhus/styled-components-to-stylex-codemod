import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type SpacedRowProps = {
  align?: "flex-start";
  justify?: keyof typeof spacedRowJustifyVariants;
} & Pick<React.ComponentProps<"div">, "ref" | "children">;

export function SpacedRow(props: SpacedRowProps) {
  const { children, align, justify, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[
        styles.spacedRow,
        align === "flex-start" && styles.spacedRowAlignFlexStart,
        justify != null && spacedRowJustifyVariants[justify],
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SpacedRow justify="space-between">
        <span>Left</span>
        <span>Right</span>
      </SpacedRow>
      <SpacedRow justify="flex-end">
        <span>End</span>
      </SpacedRow>
      <SpacedRow align="flex-start" justify="center">
        <span>Top center</span>
      </SpacedRow>
    </div>
  );
}

const styles = stylex.create({
  spacedRow: {
    display: "flex",
    flexDirection: "row",
    padding: 8,
    backgroundColor: "#f0f5ff",
  },
  spacedRowAlignFlexStart: {
    alignItems: "flex-start",
  },
});

const spacedRowJustifyVariants = stylex.create({
  "space-between": {
    justifyContent: "space-between",
  },
  "flex-end": {
    justifyContent: "flex-end",
  },
  center: {
    justifyContent: "center",
  },
});
