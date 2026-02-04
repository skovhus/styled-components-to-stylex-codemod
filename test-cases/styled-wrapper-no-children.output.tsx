import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Pattern: styled(Component) where the base component does NOT accept children
// The wrapper should NOT try to pass children through

interface TextDividerProps {
  /** The text to display */
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A divider that displays text - does not accept children */
function TextDivider(props: TextDividerProps) {
  return (
    <div className={props.className} style={props.style}>
      <span>{props.text}</span>
    </div>
  );
}

TextDivider.HEIGHT = 30;

/** Styled wrapper for TextDivider */
export function StyledTextDivider(props: React.ComponentPropsWithRef<typeof TextDivider>) {
  const { className, style, ...rest } = props;

  return <TextDivider {...rest} {...mergedSx(styles.textDivider, className, style)} />;
}

StyledTextDivider.HEIGHT = TextDivider.HEIGHT;

// Usage - no children passed
export const App = () => <StyledTextDivider text="Section" />;

const styles = stylex.create({
  textDivider: {
    paddingLeft: "20px",
  },
});
