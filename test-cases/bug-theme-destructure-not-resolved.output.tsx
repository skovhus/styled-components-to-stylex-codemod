import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: The destructured `theme` from `${({ enabled, theme }) => ...}` is converted to
// `props.theme.color.greenBase` but `theme` doesn't exist on the component's props type.
// The theme reference should be resolved via the adapter. Causes TS2339.

type Props = { enabled?: boolean };

type StatusIconProps = Omit<React.ComponentProps<"div">, "className" | "style"> & Props;

function StatusIcon(props: StatusIconProps) {
  const { children, ...rest } = props;

  const sx = stylex.props(styles.statusIcon);

  return (
    <div
      {...rest}
      {...sx}
      style={{
        ...sx.style,
        fill: props.enabled ? props.theme.color.greenBase : props.theme.color.labelMuted,
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <StatusIcon enabled />
    <StatusIcon enabled={false} />
    <StatusIcon />
  </div>
);

const styles = stylex.create({
  statusIcon: {
    width: "6px",
    height: "6px",
  },
});
