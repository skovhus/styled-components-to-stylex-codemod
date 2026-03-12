// Exported styled component where consumers only pass className (no style, no element props, no spread)
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export function TextColor(
  props: { sx?: stylex.StyleXStyles } & Pick<
    React.ComponentProps<"span">,
    "className" | "ref" | "children"
  >,
) {
  const { className, children, sx, ...rest } = props;

  return (
    <span {...rest} {...mergedSx([styles.textColor, sx], className)}>
      {children}
    </span>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <TextColor className="extra">With className only</TextColor>
  </div>
);

const styles = stylex.create({
  textColor: {
    color: "blue",
    paddingBlock: 4,
    paddingInline: 8,
  },
});
