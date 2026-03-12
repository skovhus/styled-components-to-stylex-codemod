import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  disableMinWidth?: boolean;
}>;

// Empty string in conditional - should omit property when truthy
function Box(props: BoxProps) {
  const { children, disableMinWidth } = props;

  return <div sx={[styles.box, !disableMinWidth && styles.boxNotDisableMinWidth]}>{children}</div>;
}

type BoxAltProps = React.PropsWithChildren<{
  enableMinWidth?: boolean;
}>;

// Empty string alternate - should apply property when truthy
function BoxAlt(props: BoxAltProps) {
  const { children, enableMinWidth } = props;

  return (
    <div sx={[styles.boxAlt, enableMinWidth ? styles.boxAltEnableMinWidth : undefined]}>
      {children}
    </div>
  );
}

type ContainerProps = React.PropsWithChildren<{
  compact?: boolean;
}>;

// Multiple CSS declarations in string
function Container(props: ContainerProps) {
  const { children, compact } = props;

  return <div sx={[styles.container, !compact && styles.containerNotCompact]}>{children}</div>;
}

type WrapperProps = React.PropsWithChildren<{
  fullWidth?: boolean;
}>;

// css`` tagged template with empty string consequent
function Wrapper(props: WrapperProps) {
  const { children, fullWidth } = props;

  return <div sx={[styles.wrapper, !fullWidth && styles.wrapperNotFullWidth]}>{children}</div>;
}

type WrapperAltProps = React.PropsWithChildren<{
  narrow?: boolean;
}>;

// css`` tagged template with empty string alternate
function WrapperAlt(props: WrapperAltProps) {
  const { children, narrow } = props;

  return (
    <div sx={[styles.wrapperAlt, narrow ? styles.wrapperAltNarrow : undefined]}>{children}</div>
  );
}

export const App = () => (
  <div>
    <Box>Normal (has min-width)</Box>
    <Box disableMinWidth>Disabled min-width</Box>
    <BoxAlt>No min-width</BoxAlt>
    <BoxAlt enableMinWidth>Has min-width</BoxAlt>
    <Container>Normal container with margin/border</Container>
    <Container compact>Compact container without margin/border</Container>
    <Wrapper>Wrapper (has max-width/padding)</Wrapper>
    <Wrapper fullWidth>Wrapper full width</Wrapper>
    <WrapperAlt>WrapperAlt (no max-width)</WrapperAlt>
    <WrapperAlt narrow>WrapperAlt narrow</WrapperAlt>
  </div>
);

const styles = stylex.create({
  box: {
    display: "flex",
    backgroundColor: "#e0e0e0",
    marginBottom: 8,
  },
  boxNotDisableMinWidth: {
    minWidth: 500,
  },
  boxAlt: {
    display: "flex",
    backgroundColor: "#d0d0f0",
    marginBottom: 8,
  },
  boxAltEnableMinWidth: {
    minWidth: 500,
  },
  container: {
    padding: 16,
    backgroundColor: "#f0e0d0",
    marginBottom: 8,
  },
  containerNotCompact: {
    marginTop: 24,
    marginRight: 24,
    marginBottom: 24,
    marginLeft: 24,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "gray",
  },
  wrapper: {
    backgroundColor: "#e0f0e0",
    marginBottom: 8,
  },
  wrapperNotFullWidth: {
    maxWidth: 400,
    paddingBlock: 0,
    paddingInline: 16,
  },
  wrapperAlt: {
    backgroundColor: "#f0e0f0",
    marginBottom: 8,
  },
  wrapperAltNarrow: {
    maxWidth: 400,
    paddingBlock: 0,
    paddingInline: 16,
  },
});
