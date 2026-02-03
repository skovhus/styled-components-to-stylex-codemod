import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  $disableMinWidth?: boolean;
}>;

// Empty string in conditional - should omit property when truthy
function Box(props: BoxProps) {
  const { children, $disableMinWidth } = props;
  return (
    <div {...stylex.props(styles.box, !$disableMinWidth && styles.boxNotDisableMinWidth)}>
      {children}
    </div>
  );
}

type BoxAltProps = React.PropsWithChildren<{
  $enableMinWidth?: boolean;
}>;

// Empty string alternate - should apply property when truthy
function BoxAlt(props: BoxAltProps) {
  const { children, $enableMinWidth } = props;
  return (
    <div
      {...stylex.props(styles.boxAlt, $enableMinWidth ? styles.boxAltEnableMinWidth : undefined)}
    >
      {children}
    </div>
  );
}

type ContainerProps = React.PropsWithChildren<{
  $compact?: boolean;
}>;

// Multiple CSS declarations in string
function Container(props: ContainerProps) {
  const { children, $compact } = props;
  return (
    <div {...stylex.props(styles.container, !$compact && styles.containerNotCompact)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box>Normal (has min-width)</Box>
    <Box $disableMinWidth>Disabled min-width</Box>
    <BoxAlt>No min-width</BoxAlt>
    <BoxAlt $enableMinWidth>Has min-width</BoxAlt>
    <Container>Normal container with margin/border</Container>
    <Container $compact>Compact container without margin/border</Container>
  </div>
);

const styles = stylex.create({
  box: {
    display: "flex",
    backgroundColor: "#e0e0e0",
    marginBottom: "8px",
  },
  boxNotDisableMinWidth: {
    minWidth: "500px",
  },
  boxAlt: {
    display: "flex",
    backgroundColor: "#d0d0f0",
    marginBottom: "8px",
  },
  boxAltEnableMinWidth: {
    minWidth: "500px",
  },
  container: {
    padding: "16px",
    backgroundColor: "#f0e0d0",
    marginBottom: "8px",
  },
  containerNotCompact: {
    margin: "24px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
});
