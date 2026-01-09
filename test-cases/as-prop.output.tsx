import * as stylex from "@stylexjs/stylex";
import * as React from "react";
import { Text } from "./lib/text";

type StyledTextProps = React.ComponentProps<typeof Text>;

function StyledText(props: StyledTextProps) {
  return <Text {...props} {...stylex.props(styles.text)} />;
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Normal Button</button>
    <a href="#" {...stylex.props(styles.button)}>
      Link with Button styles
    </a>
    {/* Pattern 2: styled(Component) with as prop - must preserve component's props */}
    <StyledText variant="small" color="muted">
      Normal styled text
    </StyledText>
    <StyledText variant="mini" as="label">
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
