import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { fontWeightVars } from "./tokens.stylex";

type HighlightProps = React.PropsWithChildren<{
  $dim: boolean;
}>;

// Support ternary CSS blocks that return declaration text (or empty string).

export function Highlight(props: HighlightProps) {
  const { children, $dim } = props;

  return (
    <span {...stylex.props(styles.highlight, $dim ? styles.highlightDim : undefined)}>
      {children}
    </span>
  );
}

export const App = () => (
  <div>
    <Highlight $dim>Dim</Highlight>
    <Highlight $dim={false}>No dim</Highlight>
  </div>
);

const styles = stylex.create({
  highlight: {
    fontWeight: fontWeightVars.medium,
  },
  highlightDim: {
    opacity: 0.5,
  },
});
