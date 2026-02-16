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

type WrapperProps = React.PropsWithChildren<{
  $fullWidth?: boolean;
}>;

// css`` tagged template with empty string consequent
function Wrapper(props: WrapperProps) {
  const { children, $fullWidth } = props;

  return (
    <div {...stylex.props(styles.wrapper, !$fullWidth && styles.wrapperNotFullWidth)}>
      {children}
    </div>
  );
}

type WrapperAltProps = React.PropsWithChildren<{
  $narrow?: boolean;
}>;

// css`` tagged template with empty string alternate
function WrapperAlt(props: WrapperAltProps) {
  const { children, $narrow } = props;

  return (
    <div {...stylex.props(styles.wrapperAlt, $narrow ? styles.wrapperAltNarrow : undefined)}>
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
    <Wrapper>Wrapper (has max-width/padding)</Wrapper>
    <Wrapper $fullWidth>Wrapper full width</Wrapper>
    <WrapperAlt>WrapperAlt (no max-width)</WrapperAlt>
    <WrapperAlt $narrow>WrapperAlt narrow</WrapperAlt>
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
    marginTop: "24px",
    marginRight: "24px",
    marginBottom: "24px",
    marginLeft: "24px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
  wrapper: {
    backgroundColor: "#e0f0e0",
    marginBottom: "8px",
  },
  wrapperNotFullWidth: {
    maxWidth: "400px",
    paddingBlock: 0,
    paddingInline: "16px",
  },
  wrapperAlt: {
    backgroundColor: "#f0e0f0",
    marginBottom: "8px",
  },
  wrapperAltNarrow: {
    maxWidth: "400px",
    paddingBlock: 0,
    paddingInline: "16px",
  },
});
