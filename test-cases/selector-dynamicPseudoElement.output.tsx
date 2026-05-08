import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type BadgeProps = React.PropsWithChildren<{
  badgeColor: string;
}>;

function Badge(props: BadgeProps) {
  const { children, badgeColor } = props;
  return (
    <span
      sx={styles.badge({
        badgeColor,
      })}
    >
      {children}
    </span>
  );
}

type TooltipProps = React.PropsWithChildren<{
  tipColor?: string;
}>;

// Computed interpolation inside pseudo-element: expression with fallback
function Tooltip(props: TooltipProps) {
  const { children, tipColor } = props;
  return (
    <div
      sx={styles.tooltip({
        backgroundColor: tipColor || "black",
      })}
    >
      {children}
    </div>
  );
}

type TagProps = React.PropsWithChildren<{
  tagColor?: string;
}>;

// Optional simple identity prop in pseudo-element: should emit null guard
function Tag(props: TagProps) {
  const { children, tagColor } = props;
  return (
    <span sx={[styles.tag, tagColor != null && styles.tagAfterBackgroundColor(tagColor)]}>
      {children}
    </span>
  );
}

// Indexed theme lookup in ::placeholder pseudo-element
type PlaceholderColor = "labelBase" | "labelMuted";

type DynamicPlaceholderProps = { placeholderColor: PlaceholderColor } & Omit<
  React.ComponentProps<"input">,
  "className" | "style"
>;

function DynamicPlaceholder(props: DynamicPlaceholderProps) {
  const { placeholderColor, ...rest } = props;
  return (
    <input
      {...rest}
      sx={styles.dynamicPlaceholder({
        placeholderColor,
      })}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px", width: 560, flexWrap: "wrap" }}>
    <Badge badgeColor="red">Notification</Badge>
    <Badge badgeColor="green">Online</Badge>
    <Badge badgeColor="blue">Info</Badge>
    <Tooltip tipColor="navy">With color</Tooltip>
    <Tooltip>Default</Tooltip>
    <Tag tagColor="tomato">With color</Tag>
    <Tag>No color</Tag>
    <input placeholder="Muted placeholder" sx={styles.input} />
    <DynamicPlaceholder placeholderColor="labelBase" placeholder="Base" />
    <DynamicPlaceholder placeholderColor="labelMuted" placeholder="Muted" />
  </div>
);

const styles = stylex.create({
  badge: (props: { badgeColor: string }) => ({
    position: "relative",
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#f0f0f0",
    "::after": {
      content: '""',
      position: "absolute",
      width: 8,
      height: 8,
      borderRadius: "50%",
      top: 0,
      right: 0,
      backgroundColor: props.badgeColor,
    },
  }),
  tooltip: (props: { backgroundColor: string }) => ({
    position: "relative",
    padding: 8,
    "::before": {
      content: '""',
      display: "block",
      height: 3,
      backgroundColor: props.backgroundColor,
    },
  }),
  tag: {
    position: "relative",
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "#e0e0e0",
    "::after": {
      content: '""',
      display: "block",
      height: 2,
    },
  },
  tagAfterBackgroundColor: (tagColor: string) => ({
    "::after": {
      backgroundColor: tagColor,
    },
  }),
  // Dynamic ::placeholder with theme color
  input: {
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    backgroundColor: "white",
    "::placeholder": {
      color: $colors.labelMuted,
    },
  },
  dynamicPlaceholder: (props: { placeholderColor: PlaceholderColor }) => ({
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    "::placeholder": {
      color: $colors[props.placeholderColor],
    },
  }),
});
