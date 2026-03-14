import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { fontWeightVars } from "./tokens.stylex";

type TitleProps = React.PropsWithChildren<{
  upsideDown?: boolean;
}>;

function Title(props: TitleProps) {
  const { children, upsideDown } = props;
  return <h1 sx={[styles.title, upsideDown && styles.titleUpsideDown]}>{children}</h1>;
}

type BoxProps = React.PropsWithChildren<{
  isActive?: boolean;
  isDisabled?: boolean;
}>;

function Box(props: BoxProps) {
  const { children, isActive, isDisabled } = props;
  return (
    <div sx={[styles.box, isActive && styles.boxActive, isDisabled && styles.boxDisabled]}>
      {children}
    </div>
  );
}

type HighlightProps = React.PropsWithChildren<{
  dim: boolean;
}>;

// Ternary CSS block returning declaration text or empty string
export function Highlight(props: HighlightProps) {
  const { children, dim, ...rest } = props;
  return (
    <span {...rest} sx={[styles.highlight, dim && styles.highlightDim]}>
      {children}
    </span>
  );
}

type TooltipProps = React.PropsWithChildren<{
  open?: boolean;
}>;

// Negated boolean conditions in ternary CSS blocks
export function Tooltip(props: TooltipProps) {
  const { children, open, ...rest } = props;
  return (
    <div {...rest} sx={!open && styles.tooltipNotOpen}>
      {children}
    </div>
  );
}

type OverlayProps = React.PropsWithChildren<{
  visible?: boolean;
}>;

// Negated ternary with styles in both branches
export function Overlay(props: OverlayProps) {
  const { children, visible, ...rest } = props;
  return (
    <div {...rest} sx={[styles.overlay, !visible && styles.overlayNotVisible]}>
      {children}
    </div>
  );
}

// String comparison: !== false (treated as boolean conditional)
const IconButton = (props: React.ComponentProps<"button">) => <button {...props} />;

type StyledIconButtonProps = { useRoundStyle?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof IconButton>,
  "className" | "style"
>;

function StyledIconButton(props: StyledIconButtonProps) {
  const { children, useRoundStyle, ...rest } = props;
  return (
    <IconButton
      {...rest}
      {...stylex.props(
        styles.iconButton,
        useRoundStyle !== false && styles.iconButtonUseRoundStyle,
      )}
    >
      {children}
    </IconButton>
  );
}

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title upsideDown>Upside Down Title</Title>
    <Box>Normal Box</Box>
    <Box isActive>Active Box</Box>
    <Box isDisabled>Disabled Box</Box>
    <Highlight dim>Dim</Highlight>
    <Highlight dim={false}>No dim</Highlight>
    <Tooltip open>Visible tooltip</Tooltip>
    <Tooltip open={false}>Hidden tooltip</Tooltip>
    <Tooltip>Default hidden tooltip</Tooltip>
    <Overlay visible>Visible overlay</Overlay>
    <Overlay visible={false}>Hidden overlay</Overlay>
    <StyledIconButton>Icon</StyledIconButton>
  </div>
);

const styles = stylex.create({
  title: {
    textAlign: "center",
    color: "#BF4F74",
  },
  titleUpsideDown: {
    transform: "rotate(180deg)",
  },
  box: {
    padding: "1rem",
    backgroundColor: "papayawhip",
    opacity: 1,
    cursor: "pointer",
  },
  boxActive: {
    backgroundColor: "mediumseagreen",
  },
  boxDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  highlight: {
    fontWeight: fontWeightVars.medium,
  },
  highlightDim: {
    opacity: 0.5,
  },
  tooltipNotOpen: {
    pointerEvents: "none",
    opacity: 0.1,
  },
  overlay: {
    inset: 0,
    opacity: 1,
  },
  overlayNotVisible: {
    opacity: 0,
  },
  iconButton: {
    padding: 4,
  },
  iconButtonUseRoundStyle: {
    borderRadius: "100%",
  },
});
