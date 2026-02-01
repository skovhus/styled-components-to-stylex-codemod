import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface TextProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A polymorphic Text component that accepts "as" prop */
function Text(props: TextProps & { as?: React.ElementType }) {
  const { as: Component = "span", children, className, style } = props;
  return (
    <Component className={className} style={style}>
      {children}
    </Component>
  );
}

type StyledButtonProps = Omit<React.ComponentPropsWithRef<typeof Text>, "style"> & {
  ref?: React.Ref<HTMLButtonElement>;
};

// B has .attrs({ as: "button" }) but is only used as a base for A.
// The chain-flattening logic must NOT flatten A to Text, because
// B's wrapper semantics (as="button") would be lost.
function StyledButton(props: StyledButtonProps) {
  const { className, ...rest } = props;
  return <Text as="button" {...rest} {...mergedSx(styles.styledButton, className)} />;
}

type ClickableTextProps = Omit<
  React.ComponentPropsWithRef<typeof StyledButton>,
  "style" | "className"
>;

// A extends B - this MUST preserve B's as="button" semantics
export function ClickableText(props: ClickableTextProps) {
  return <StyledButton {...props} {...stylex.props(styles.clickableText)} />;
}

export const App = () => (
  <div>
    <ClickableText>Click me</ClickableText>
  </div>
);

const styles = stylex.create({
  // B has .attrs({ as: "button" }) but is only used as a base for A.
  // The chain-flattening logic must NOT flatten A to Text, because
  // B's wrapper semantics (as="button") would be lost.
  styledButton: {
    cursor: "pointer",
  },
  clickableText: {
    color: "blue",
  },
});
