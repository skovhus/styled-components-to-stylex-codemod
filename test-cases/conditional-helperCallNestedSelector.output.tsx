import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TextProps = React.PropsWithChildren<{
  $truncate?: boolean;
}>;

// Helper call conditional inside a pseudo selector - should preserve :hover context
function Text(props: TextProps) {
  const { children, $truncate } = props;

  return (
    <p {...stylex.props(styles.text, $truncate ? styles.textTruncate : undefined)}>{children}</p>
  );
}

export const App = () => (
  <div
    style={{
      display: "grid",
      gap: 12,
      padding: 12,
      border: "1px dashed #d1d5db",
      maxWidth: 240,
    }}
  >
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Normal</div>
      <Text>Normal text that will wrap without truncation on hover</Text>
    </div>
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Truncate on hover</div>
      <Text $truncate>Long text that will truncate with ellipsis when you hover over this box</Text>
    </div>
  </div>
);

const styles = stylex.create({
  text: {
    fontSize: "14px",
    width: "180px",
    paddingBlock: "8px",
    paddingInline: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#cfd8dc",
    backgroundColor: "#f8f9fb",
    whiteSpace: "normal",
    overflow: "visible",
    textOverflow: "clip",
    margin: 0,
  },
  textTruncate: {
    whiteSpace: {
      default: "normal",
      ":hover": "nowrap",
    },
    overflow: {
      default: "visible",
      ":hover": "hidden",
    },
    textOverflow: {
      default: "clip",
      ":hover": "ellipsis",
    },
  },
});
