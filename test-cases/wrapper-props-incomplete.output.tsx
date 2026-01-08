import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// Bug 12: When codemod generates wrapper function, the props type must include
// standard HTML attributes (className, children, style) that the wrapper uses.
// Otherwise: "Property 'className' does not exist on type 'MyProps'"

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
});

// Pattern 1: styled("span") with custom props - wrapper needs span attributes
// Props type must EXTEND React.ComponentProps<"span"> to include className, children, style
interface TextColorProps extends React.ComponentProps<"span"> {
  /** Custom color prop */
  color: string;
}

export function TextColor(props: TextColorProps) {
  const { color, style, ...rest } = props;
  return (
    <span
      {...rest}
      {...stylex.props(styles.textColor, color != null && styles.textColorColor(color))}
      style={style}
    />
  );
}

// Pattern 2: styled(Component) - wrapper needs component's props + HTML attributes
const BaseText = (props: React.ComponentProps<"span">) => <span {...props} />;

// Props type must EXTEND the base component's props
interface HighlightProps extends React.ComponentProps<typeof BaseText> {
  /** Whether to highlight */
  highlighted?: boolean;
}

export function Highlight(props: HighlightProps) {
  const { highlighted, style, ...rest } = props;
  return (
    <BaseText
      {...rest}
      {...stylex.props(styles.highlight, highlighted && styles.highlightHighlighted)}
      style={style}
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
