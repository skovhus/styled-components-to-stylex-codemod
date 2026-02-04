import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

function Button<C extends React.ElementType = "button">(
  props: Omit<React.ComponentPropsWithRef<C>, "className" | "style"> & { as?: C },
) {
  const { as: Component = "button", children, ...rest } = props;
  return (
    <Component {...rest} {...stylex.props(styles.button)}>
      {children}
    </Component>
  );
}

type StyledTextProps<C extends React.ElementType = typeof Text> = React.ComponentPropsWithRef<
  typeof Text
> &
  Omit<
    React.ComponentPropsWithRef<C>,
    keyof React.ComponentPropsWithRef<typeof Text> | "className" | "style"
  > & {
    as?: C;
  };

// Pattern 2: styled(Component) where Component has custom props (like variant)
// When used with as="label", the component's props must be preserved
function StyledText<C extends React.ElementType = typeof Text>(props: StyledTextProps<C>) {
  const { as: Component = Text, ...rest } = props;
  return <Component {...rest} {...stylex.props(styles.text)} />;
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
    paddingBlock: "0.25em",
    paddingInline: "1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    borderRadius: "3px",
  },

  // Pattern 2: styled(Component) where Component has custom props (like variant)
  // When used with as="label", the component's props must be preserved
  text: {
    marginTop: "4px",
  },
});
