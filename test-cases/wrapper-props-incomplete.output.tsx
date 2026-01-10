import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

// Bug 12: When codemod generates wrapper function, the props type must include
// standard HTML attributes (className, children, style) that the wrapper uses.
// Otherwise: "Property 'className' does not exist on type 'MyProps'"

// Pattern 1: styled("span") with custom props - wrapper needs span attributes
interface TextColorProps extends React.ComponentProps<"span"> {
  /** Custom color prop */
  color: string;
}

export function TextColor(props: TextColorProps) {
  const { className, children, style, color, ...rest } = props;

  const sx = stylex.props(styles.textColor, color != null && styles.textColorColor(color));
  return (
    <span
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
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
  const { highlighted, ...rest } = props;
  return (
    <BaseText
      {...rest}
      {...stylex.props(styles.highlight, highlighted && styles.highlightHighlighted)}
    />
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
interface ThemeTextProps extends Omit<React.ComponentProps<"span">, "className" | "style"> {
  /** Theme color name */
  themeColor: string;
}

/** A text span that gets color from theme */
export function ThemeText(props: ThemeTextProps) {
  const { children, themeColor, ...rest } = props;

  const sx = stylex.props(
    styles.themeText,
    themeColor != null && styles.themeTextColor(themeColor),
  );
  return (
    <span {...rest} {...sx}>
      {children}
    </span>
  );
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
