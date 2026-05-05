import * as React from "react";
import "./cssVariable-basic.css";
import * as stylex from "@stylexjs/stylex";
import { vars } from "./css-variables.stylex";

type TaggedSpanProps = React.PropsWithChildren<{
  tone: string;
}>;

// Adapter-resolvable var() with a default value should drop the default
// (the resolved StyleX token supersedes the runtime fallback).
function TaggedSpan(props: TaggedSpanProps) {
  const { children, tone } = props;
  return <span sx={[styles.taggedSpan, styles.taggedSpanBackgroundColor(props)]}>{children}</span>;
}

export const App = () => (
  <div sx={styles.card}>
    <p style={textInlineStyle}>Some text content</p>
    <button sx={styles.button}>Click me</button>
    <TaggedSpan tone="papayawhip">Tagged</TaggedSpan>
  </div>
);

const textInlineStyle = {
  color: "var(--text-color, #333)",
  fontSize: "var(--font-size, 16px)",
  lineHeight: "var(--line-height, 1.5)",
} satisfies React.CSSProperties;

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
});
