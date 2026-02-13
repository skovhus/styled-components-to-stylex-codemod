import React from "react";
import * as stylex from "@stylexjs/stylex";

function Holder(props: { icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{props.children}</div>
  );
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.trigger, stylex.defaultMarker())}>
      <Holder
        icon={
          <svg viewBox="0 0 20 20" {...stylex.props(styles.icon)}>
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        }
      >
        Hover me
      </Holder>
      <svg viewBox="0 0 20 20" {...stylex.props(styles.icon, styles.iconInTrigger)}>
        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
      </svg>
    </button>
  </div>
);

const styles = stylex.create({
  icon: {
    width: "24px",
    height: "24px",
    fill: "#bf4f74",
    transition: "fill 0.25s",
  },
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    paddingBlock: "6px",
    paddingInline: "10px",
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  iconInTrigger: {
    fill: {
      default: "#bf4f74",
      [stylex.when.ancestor(":hover")]: "rebeccapurple",
    },
  },
});
