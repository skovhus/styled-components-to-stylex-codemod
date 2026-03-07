// Transient prop renaming: exported styled(Component) with $-prefixed props
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function Icon(props: IconProps) {
  return (
    <span className={props.className} style={props.style}>
      {props.children}
    </span>
  );
}

interface ExpandIconProps extends IconProps {
  $isExpanded: boolean;
}

function ExpandIcon(props: ExpandIconProps) {
  const { $isExpanded, ...rest } = props;
  return (
    <Icon {...rest}>
      <svg viewBox="0 0 16 16">
        <path d={$isExpanded ? "M3 10L8 5L13 10" : "M3 6L8 11L13 6"} />
      </svg>
    </Icon>
  );
}

// Exported styled(Component) with $-prefixed prop used for styling.
// The $ prefix must be stripped so styled-components v6 consumers
// doing styled(TreeToggle) don't lose the prop.
export function TreeToggle(
  props: Omit<
    React.ComponentPropsWithRef<typeof ExpandIcon>,
    "className" | "style" | "$isExpanded"
  > & { [K in "$isExpanded" as "isExpanded"]: React.ComponentPropsWithRef<typeof ExpandIcon>[K] },
) {
  const { children, isExpanded, ...rest } = props;

  return (
    <ExpandIcon
      $isExpanded={isExpanded}
      {...rest}
      {...stylex.props(styles.treeToggle, isExpanded ? styles.treeToggleExpanded : undefined)}
    >
      {children}
    </ExpandIcon>
  );
}

type StatusBadgeProps = React.PropsWithChildren<{
  variant: "success" | "warning" | "error";
  compact?: boolean;
}>;

// Exported styled.div with multiple $-prefixed props.
// All should be renamed for the same sc v6 forwarding reason.
export function StatusBadge(props: StatusBadgeProps) {
  const { children, compact, variant, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[
        styles.statusBadge,
        compact ? styles.statusBadgeCompact : undefined,
        variantVariants[variant],
      ]}
    >
      {children}
    </div>
  );
}

type PrivateLabelProps = React.PropsWithChildren<{
  $bold?: boolean;
}>;

// Non-exported component — should keep $-prefix
function PrivateLabel(props: PrivateLabelProps) {
  const { children, $bold } = props;

  return (
    <span sx={[styles.privateLabel, $bold ? styles.privateLabelBold : undefined]}>{children}</span>
  );
}

type ColorChipProps = {
  $color: string;
  color: string;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

// Collision: $color cannot be renamed because `color` already exists as a prop
export function ColorChip(props: ColorChipProps) {
  const { children, $color, color, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[styles.colorChip, styles.colorChipBackgroundColor($color), styles.colorChipColor(color)]}
    >
      {children}
    </div>
  );
}

type SpecifierTagProps = { highlighted?: boolean } & React.ComponentProps<"div">;

// Specifier export (export { ... }) — should also be renamed
function SpecifierTag(props: SpecifierTagProps) {
  const { className, children, style, highlighted, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [styles.specifierTag, highlighted ? styles.specifierTagHighlighted : undefined],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

export { SpecifierTag };

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <TreeToggle isExpanded>Expanded</TreeToggle>
        <TreeToggle isExpanded={false}>Collapsed</TreeToggle>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <StatusBadge variant="success">OK</StatusBadge>
        <StatusBadge variant="warning" compact>
          Warn
        </StatusBadge>
        <StatusBadge variant="error" compact={false}>
          Fail
        </StatusBadge>
      </div>
      <PrivateLabel $bold>Bold text</PrivateLabel>
      <PrivateLabel>Normal text</PrivateLabel>
      <ColorChip $color="blue" color="white">
        Collision kept
      </ColorChip>
      <SpecifierTag highlighted>Highlighted</SpecifierTag>
      <SpecifierTag>Normal</SpecifierTag>
    </div>
  );
}

const styles = stylex.create({
  treeToggle: {
    transition: "transform 0.15s ease",
    cursor: "pointer",
    padding: "4px",
  },
  treeToggleExpanded: {
    transform: "rotate(180deg)",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: "4px",
    paddingInline: "12px",
    borderRadius: "12px",
    fontSize: "13px",
    backgroundColor: "red",
    color: "white",
  },
  statusBadgeCompact: {
    paddingBlock: "2px",
    paddingInline: "6px",
    fontSize: "11px",
  },
  privateLabel: {
    fontWeight: 400,
  },
  privateLabelBold: {
    fontWeight: 700,
  },
  colorChip: {
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: "4px",
  },
  colorChipBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  colorChipColor: (color: string) => ({
    color,
  }),
  specifierTag: {
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "gray",
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: "4px",
  },
  specifierTagHighlighted: {
    borderColor: "gold",
  },
});

const variantVariants = stylex.create({
  success: {
    backgroundColor: "green",
  },
  warning: {
    backgroundColor: "orange",
  },
  error: {
    backgroundColor: "red",
  },
});
