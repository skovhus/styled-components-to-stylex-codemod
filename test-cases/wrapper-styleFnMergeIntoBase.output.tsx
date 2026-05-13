import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type PositionProps = React.PropsWithChildren<{
  zIndex: number;
  disablePointerEvents: boolean;
}>;

function Position(props: PositionProps) {
  const { children, zIndex, disablePointerEvents } = props;
  return (
    <div
      sx={[
        styles.position({
          zIndex,
        }),
        disablePointerEvents && styles.positionDisablePointerEvents,
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <Position zIndex={100} disablePointerEvents={false}>
      content
    </Position>
  );
}

const styles = stylex.create({
  position: (props: { zIndex: number }) => ({
    position: "fixed",
    pointerEvents: "auto",
    zIndex: props.zIndex,
  }),
  positionDisablePointerEvents: {
    pointerEvents: "none",
  },
});
