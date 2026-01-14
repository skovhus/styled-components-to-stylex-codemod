import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

type ButtonProps<C extends React.ElementType = "button"> = Omit<
  React.ComponentPropsWithoutRef<C>,
  "className" | "style"
> & { as?: C };

function Button<C extends React.ElementType = "button">(props: ButtonProps<C>) {
  const { as: Component = "button", children, ...rest } = props;
  return (
    <Component {...rest} {...stylex.props(styles.button)}>
      {children}
    </Component>
  );
}

type StyledTextProps<C extends React.ElementType = typeof Text> = Omit<
  React.ComponentProps<typeof Text>,
  "className" | "style"
> & { as?: C } & Omit<
    React.ComponentPropsWithoutRef<C>,
    keyof React.ComponentProps<typeof Text> | "as"
  >;

function StyledText<C extends React.ElementType = typeof Text>(props: StyledTextProps<C>) {
  return <Text {...props} {...stylex.props(styles.text)} />;
}

export const App = () => (
  <div>
    <Button>Normal Button</Button>
    <Button as="a" href="#">
      Link with Button styles
    </Button>
    {/* Pattern 2: styled(Component) with as prop */}
    <StyledText variant="small" color="muted">
      Normal styled text
    </StyledText>
    {/* Pattern 3: as="label" with label-specific props like htmlFor */}
    <StyledText variant="mini" as="label" htmlFor="my-input">
      Label using Text styles
    </StyledText>
  </div>
);

const styles = stylex.create({
  // Pattern 1: styled.element with as prop at call site
  button: {
    display: "inline-block",
    color: "#BF4F74",
    fontSize: "1em",
    margin: "1em",
    padding: "0.25em 1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    borderRadius: "3px",
  },
  text: {
    marginTop: "4px",
  },
});
