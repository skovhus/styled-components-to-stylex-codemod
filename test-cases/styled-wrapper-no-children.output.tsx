import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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
type StyledTextDividerProps = Omit<React.ComponentProps<typeof TextDivider>, "children">;

export function StyledTextDivider(props: StyledTextDividerProps) {
  const { className, style, ...rest } = props;

  const sx = stylex.props(styles.textDivider);
  return (
    <TextDivider
      {...rest}
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    />
  );
}

StyledTextDivider.HEIGHT = TextDivider.HEIGHT;

// Usage - no children passed
export const App = () => <StyledTextDivider text="Section" />;

const styles = stylex.create({
  textDivider: {
    paddingLeft: "20px",
  },
});
