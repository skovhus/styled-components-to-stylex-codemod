import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { themeVars } from "./tokens.stylex";
import type { Colors } from "./lib/colors";

// Bug 12: When codemod generates wrapper function, the props type must include
// standard HTML attributes (className, children, style) that the wrapper uses.
// Otherwise: "Property 'className' does not exist on type 'MyProps'"

// Pattern 1: styled("span") with custom props - wrapper needs span attributes
interface TextColorProps extends React.ComponentProps<"span"> {
  /** Custom color prop */
  color: string;
  as?: React.ElementType;
}

export function TextColor(props: TextColorProps) {
  const { as: Component = "span", className, children, style, color } = props;
  return (
    <Component {...mergedSx([styles.textColorColor(color)], className, style)}>
      {children}
    </Component>
  );
}

// Pattern 2: styled(Component) - wrapper needs component's props + HTML attributes
const BaseText = (props: React.ComponentProps<"span">) => <span {...props} />;

interface HighlightProps extends Omit<React.ComponentPropsWithRef<typeof BaseText>, "style"> {
  /** Whether to highlight */
  highlighted?: boolean;
}

export function Highlight(props: HighlightProps) {
  const { className, children, highlighted, ...rest } = props;
  return (
    <BaseText
      {...rest}
      {...mergedSx([styles.highlight, highlighted && styles.highlightHighlighted], className)}
    >
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
interface ThemeTextProps extends React.ComponentProps<"span"> {
  /** Theme color name */
  themeColor: Colors;
}

/** A text span that gets color from theme */
export function ThemeText(props: ThemeTextProps) {
  const { className, children, style, themeColor } = props;
  return (
    <span {...mergedSx([styles.themeTextColor(themeColor)], className, style)}>{children}</span>
  );
}

const styles = stylex.create({
  textColorColor: (color: string) => ({
    color,
  }),
  highlight: {
    backgroundColor: "transparent",
  },
  highlightHighlighted: {
    backgroundColor: "yellow",
  },
  themeTextColor: (themeColor: Colors) => ({
    color: themeVars[themeColor],
  }),
});
