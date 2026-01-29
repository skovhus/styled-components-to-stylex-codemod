import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type DropZoneProps = React.PropsWithChildren<{
  $isDraggingOver: boolean;
}>;

// Support ternary interpolations where branches are template literals with theme access.
// The adapter should resolve the theme color.

export function DropZone(props: DropZoneProps) {
  const { children, $isDraggingOver, ...rest } = props;
  return (
    <div
      {...rest}
      {...stylex.props(styles.dropZone, $isDraggingOver && styles.dropZoneDraggingOver)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <DropZone $isDraggingOver>Dragging</DropZone>
    <DropZone $isDraggingOver={false}>Not dragging</DropZone>
  </div>
);

const styles = stylex.create({
  dropZone: {
    padding: "16px",
    borderRadius: "8px",
    boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.06)",
  },
  dropZoneDraggingOver: {
    boxShadow: `inset 0 0 0 1px ${$colors.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06)`,
  },
});
