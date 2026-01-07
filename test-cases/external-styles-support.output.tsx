import * as stylex from "@stylexjs/stylex";

// This component is exported and will use shouldSupportExternalStyles to enable
// className/style/rest merging for external style extension support.
export {};

const styles = stylex.create({
  exportedButton: {
    backgroundColor: "#bf4f74",
    color: "white",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },

  // This is also exported but won't use shouldSupportExternalStyles (for comparison)
  internalBox: {
    backgroundColor: "#f0f0f0",
    padding: "16px",
  },
});

function ExportedButton(props) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.exportedButton);

  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

ExportedButton.displayName = "ExportedButton";

export const App = () => (
  <div>
    <ExportedButton>Styled Button</ExportedButton>
    <div {...stylex.props(styles.internalBox)}>Internal Box</div>
  </div>
);
