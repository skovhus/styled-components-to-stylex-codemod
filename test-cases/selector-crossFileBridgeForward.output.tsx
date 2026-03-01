import React from "react";
import * as stylex from "@stylexjs/stylex";
import { CollapseArrowIcon } from "./lib/converted-collapse-icon";

import { StyledCollapseButtonMarker } from "./selector-crossFileBridgeForward.input.stylex";

export function StyledCollapseButton(props: {
  ref?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}) {
  const { children, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.styledCollapseButton,
        stylex.defaultMarker(),
        StyledCollapseButtonMarker,
      )}
    >
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
  styledCollapseButton: {
    padding: "12px",
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
