import "./cssVariable-basic.css";
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import { vars } from "./css-variables.stylex";

function Button({ children }: { children?: React.ReactNode }) {
  return <button sx={styles.button}>{children}</button>;
}

type TaggedSpanProps = React.PropsWithChildren<{
  tone: string;
}>;

// Adapter-resolvable var() with a default value should drop the default
// (the resolved StyleX token supersedes the runtime fallback).
function TaggedSpan(props: TaggedSpanProps) {
  const { children, tone } = props;
  return (
    <span
      sx={[
        styles.taggedSpan,
        styles.taggedSpanBackgroundColor(props),
        styles.taggedSpanOutline(props),
      ]}
    >
      {children}
    </span>
  );
}

// Custom-property-only wrappers must remain real block elements. Replacing the
// wrapper box with display: contents changes layout even if the CSS variable
// still inherits to descendants.
function WidgetContainer({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={
        {
          "--agent-item-min-width": "100%",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type VariantWidgetContainerProps = React.PropsWithChildren<{
  wide?: boolean;
}>;

function VariantWidgetContainer(props: VariantWidgetContainerProps) {
  const { children, wide } = props;
  return (
    <div sx={[styles.variantWidgetContainer, wide && styles.variantWidgetContainerWide]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div sx={styles.card}>
    <p style={textInlineStyle}>Some text content</p>
    <Button>Click me</Button>
    <TaggedSpan tone="papayawhip">Tagged</TaggedSpan>
    <WidgetContainer>
      <TaggedSpan tone="mistyrose">Wide tagged</TaggedSpan>
    </WidgetContainer>
    <WidgetContainer>
      <Button>Wide button</Button>
    </WidgetContainer>
    <div style={singleUseWidgetContainerInlineStyle}>
      <Button>Single-use wide button</Button>
    </div>
    <div sx={styles.conditionalWidgetContainer}>
      <Button>Conditional wide button</Button>
    </div>
    <VariantWidgetContainer wide>
      <Button>Variant wide button</Button>
    </VariantWidgetContainer>
    <div sx={[styles.externalVarsWidgetContainer, helpers.focusOutline]}>
      <Button>External vars wide button</Button>
    </div>
  </div>
);

const textInlineStyle = {
  color: "var(--text-color, #333)",
  fontSize: "var(--font-size, 16px)",
  lineHeight: "var(--line-height, 1.5)",
} satisfies React.CSSProperties;

const singleUseWidgetContainerInlineStyle = {
  "--agent-item-min-width": "75%",
} as React.CSSProperties;

const styles = stylex.create({
  button: {
    paddingBlock: vars.spacingSm,
    paddingInline: vars.spacingMd,
    backgroundColor: {
      default: vars.colorPrimary,
      ":hover": vars.colorSecondary,
    },
    color: "white",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
  },
  card: {
    padding: vars.spacingLg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
    margin: vars.spacingMd,
  },
  taggedSpan: {
    color: vars.colorPrimary,
  },
  taggedSpanBackgroundColor: (props: TaggedSpanProps) => ({
    backgroundColor: vars.colorSecondary,
  }),
  taggedSpanOutline: (props) => ({
    outline: `2px solid ${vars.colorSecondary}`,
  }),
  conditionalWidgetContainer: {
    "--agent-item-min-width": {
      default: null,
      ":hover": "80%",
      "@media (min-width: 600px)": "75%",
    },
  },
  variantWidgetContainer: {
    "--agent-item-min-width": "100%",
  },
  variantWidgetContainerWide: {
    "--agent-item-min-width": "75%",
  },
  externalVarsWidgetContainer: {
    "--agent-item-min-width": "50%",
  },
});
