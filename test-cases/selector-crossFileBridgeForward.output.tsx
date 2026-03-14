import React from "react";
import * as stylex from "@stylexjs/stylex";
import { CollapseArrowIcon } from "./lib/converted-collapse-icon";

import { StyledCollapseButtonMarker } from "./selector-crossFileBridgeForward.input.stylex";

export function StyledCollapseButton(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={[styles.collapseButton, stylex.defaultMarker(), StyledCollapseButtonMarker]}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <StyledCollapseButton>
        <CollapseArrowIcon {...stylex.props(styles.collapseArrowIconInStyledCollapseButton)} />
        <span>Hover me</span>
      </StyledCollapseButton>
    </div>
  );
}

const styles = stylex.create({
  collapseButton: {
    padding: 12,
    backgroundColor: "#f0f0f0",
    cursor: "pointer",
  },
  collapseArrowIconInStyledCollapseButton: {
    backgroundColor: {
      default: null,
      [stylex.when.ancestor(":hover", StyledCollapseButtonMarker)]: "rebeccapurple",
    },
  },
});
