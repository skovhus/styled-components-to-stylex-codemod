import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

/** A polymorphic Text component that accepts "as" prop */
function Text<C extends React.ElementType = "span">(
  props: React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "span", children, className, style } = props;
  return (
    <Component className={className} style={style}>
      {children}
    </Component>
  );
}

type StyledButtonProps = { ref?: React.Ref<HTMLButtonElement> } & {
  sx?: stylex.StyleXStyles;
} & Omit<React.ComponentPropsWithRef<typeof Text>, "as">;

// B has .attrs({ as: "button" }) but is only used as a base for A.
// The chain-flattening logic must NOT flatten A to Text, because
// B's wrapper semantics (as="button") would be lost.
function StyledButton(props: StyledButtonProps) {
  const { className, style, sx, ...rest } = props;
  return <Text {...rest} as="button" {...mergedSx([styles.button, sx], className, style)} />;
}

type ClickableTextProps = { ref?: React.Ref<HTMLButtonElement> } & Omit<
  React.ComponentPropsWithRef<typeof StyledButton>,
  "className" | "style" | "as"
>;

// A extends B - this MUST preserve B's as="button" semantics
export function ClickableText(props: ClickableTextProps) {
  const { children, sx, ...rest } = props;
  return (
    <StyledButton {...rest} as="button" sx={[styles.clickableText, sx]}>
      {children}
    </StyledButton>
  );
}

export const App = () => (
  <div>
    <ClickableText>Click me</ClickableText>
  </div>
);

const styles = stylex.create({
  button: {
    cursor: "pointer",
  },
  clickableText: {
    color: "blue",
  },
});
