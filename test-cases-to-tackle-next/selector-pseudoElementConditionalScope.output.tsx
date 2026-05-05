import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type OverlayListProps = React.PropsWithChildren<{
  hideOverlay?: boolean;
}>;

function OverlayList(props: OverlayListProps) {
  const { children, hideOverlay } = props;
  return (
    <ul sx={[styles.overlayList, hideOverlay && styles.overlayListHideOverlay]}>{children}</ul>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <OverlayList>
      <li>Overlay visible</li>
    </OverlayList>
    <OverlayList hideOverlay>
      <li>Overlay hidden</li>
    </OverlayList>
  </div>
);

const styles = stylex.create({
  overlayList: {
    position: "relative",
    minHeight: 72,
    padding: 16,
    backgroundColor: "#f8fafc",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      backgroundImage: "linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.2))",
      pointerEvents: "none",
    },
  },
  overlayListHideOverlay: {
    "::after": {
      display: "none",
    },
  },
});
