import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

// Bug 12: When codemod generates wrapper function, the props type must include
// standard HTML attributes (className, children, style) that the wrapper uses.
// Otherwise: "Property 'className' does not exist on type 'MyProps'"

// Pattern 1: styled("span") with custom props - wrapper needs span attributes
interface TextColorProps extends React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  color?: any;
}> {
  /** Custom color prop */
  color: string;
}

export function TextColor(props: TextColorProps) {
  const { className, children, style, color } = props;

  const sx = stylex.props(styles.textColor, color != null && styles.textColorColor(color));
  return (
    <span
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Pattern 2: styled(Component) - wrapper needs component's props + HTML attributes
const BaseText = (props: React.ComponentProps<"span">) => <span {...props} />;

interface HighlightProps extends Omit<React.ComponentProps<typeof BaseText>, "style"> {
  /** Whether to highlight */
  highlighted?: boolean;
}

export function Highlight(props: HighlightProps) {
  const { className, children, highlighted, ...rest } = props;

  const sx = stylex.props(styles.highlight, highlighted && styles.highlightHighlighted);
  return (
    <BaseText {...rest} {...sx} className={[sx.className, className].filter(Boolean).join(" ")}>
      {children}
    </BaseText>
  );
}

export function App() {
  return (
    <>
      <TextColor color="red" className="custom" style={{ fontSize: 14 }}>
        Red text
      </TextColor>
      <Highlight highlighted className="highlight">
        Highlighted text
      </Highlight>
    </>
  );
}

// Pattern 3: styled("span") with NO local usage - wrapper props should still be extended
// This matches TextColor.tsx in a design system which doesn't use the component in the same file
interface ThemeTextProps {
  /** Theme color name */
  themeColor: string;
}

/** A text span that gets color from theme */
export function ThemeText(props: ThemeTextProps) {
  const { children, themeColor } = props;

  const sx = stylex.props(
    styles.themeText,
    themeColor != null && styles.themeTextColor(themeColor),
  );
  return <span {...sx}>{children}</span>;
}

const styles = stylex.create({
  textColor: {},
  textColorColor: (color: string) => ({
    color,
  }),
  highlight: {
    backgroundColor: "transparent",
  },
  highlightHighlighted: {
    backgroundColor: "yellow",
  },
  /** A text span that gets color from theme */
  themeText: {},
  themeTextColor: (themeColor: string) => ({
    color: themeVars[themeColor],
  }),
});
