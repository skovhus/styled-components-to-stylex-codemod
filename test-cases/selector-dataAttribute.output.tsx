import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { motion } from "./lib/framer-motion";

export const DataAnimatingAttribute = `data-animating`;

function StyledMotionDiv(
  props: { sx?: stylex.StyleXStyles } & Omit<
    React.ComponentPropsWithRef<typeof motion.div>,
    "className"
  >,
) {
  const { style, sx, ...rest } = props;
  const _sx = stylex.props(styles.motionDiv, sx);

  return (
    <motion.div
      {...rest}
      {..._sx}
      style={{
        ..._sx.style,
        ...style,
      }}
    />
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div data-visible="true" sx={[styles.box, styles.boxVisible]}>
        Visible
      </div>
      <div sx={[styles.box, styles.boxHidden]}>Hidden</div>
      <div aria-checked="true">
        <div sx={[styles.menuItem, styles.menuItemChecked]}>Checked</div>
      </div>
      <div>
        <div sx={[styles.menuItem, styles.menuItemDefault]}>Default</div>
      </div>
      <div data-active="true">
        <div sx={styles.indicator}>Active</div>
      </div>
      <div data-state="active" data-size="lg">
        <div sx={styles.compoundItem}>Compound</div>
      </div>
      <StyledMotionDiv data-animating="true" style={{ backgroundColor: "lavender" }}>
        Animating local attr
      </StyledMotionDiv>
    </div>
  );
}

const styles = stylex.create({
  box: {
    opacity: {
      default: 0,
      ':is([data-visible="true"])': 1,
    },
    transition: "opacity 0.2s",
  },
  // Comma-separated ancestor attribute selectors
  menuItem: {
    opacity: {
      default: 0.5,
      ':is([aria-checked="true"] *)': 1,
      ':is([data-focused="true"] *)': 1,
      ':is([aria-selected="true"] *)': 1,
      ':is([aria-checked="mixed"] *)': 1,
    },
    paddingBlock: 8,
    paddingInline: 12,
  },
  // Single ancestor attribute selector (no comma)
  indicator: {
    opacity: {
      default: 0,
      ':is([data-active="true"] *)': 1,
    },
    backgroundColor: "lightcyan",
    padding: 10,
  },
  // Compound ancestor attributes (AND — both must be on the same ancestor)
  compoundItem: {
    opacity: {
      default: 0,
      ':is([data-state="active"][data-size="lg"] *)': 1,
    },
    backgroundColor: "thistle",
    padding: 10,
  },
  motionDiv: {
    width: 160,
    maxHeight: {
      default: 80,
      ':is([data-animating="true"])': 40,
    },
    overflow: {
      default: "visible",
      ':is([data-animating="true"])': "hidden",
    },
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#222",
  },
  boxVisible: {
    backgroundColor: "lightblue",
    padding: 20,
  },
  boxHidden: {
    backgroundColor: "lightcoral",
    padding: 20,
  },
  menuItemChecked: {
    backgroundColor: "lightgreen",
  },
  menuItemDefault: {
    backgroundColor: "lightyellow",
  },
});
