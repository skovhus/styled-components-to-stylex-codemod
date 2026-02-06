import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

type ContainerProps = React.PropsWithChildren<{
  $compact: boolean;
}>;

// Bug: When thinPixel() is resolved to pixelVars.thin (a StyleXVar<string>),
// wrapping it in a template literal causes TS2731: Implicit conversion of a 'symbol' to a 'string'
// Real-world cases: DashboardPageTitle.tsx:295, LabelDescriptionInput.tsx:120

function Container(props: ContainerProps) {
  const { children, $compact } = props;

  return (
    <div {...stylex.props(styles.container, $compact ? styles.containerCompact : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Container $compact>Compact mode</Container>
    <Container $compact={false}>Normal mode</Container>
  </div>
);

const styles = stylex.create({
  container: {
    padding: "16px",
    marginLeft: "0px",
    backgroundColor: "#f0f0f0",
  },
  containerCompact: {
    padding: pixelVars.thin,
    marginLeft: `calc(-4px + ${pixelVars.thin})`,
  },
});
