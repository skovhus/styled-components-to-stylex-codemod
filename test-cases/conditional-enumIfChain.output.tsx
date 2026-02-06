import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Props = { state: "up" | "down" | "both" };

type TopArrowStemProps = React.PropsWithChildren<{
  $state: Props["state"];
}>;

function TopArrowStem(props: TopArrowStemProps) {
  const { children, $state } = props;

  return <g {...stylex.props(styles.topArrowStem, $stateVariants[$state])}>{children}</g>;
}

export const App = () => (
  <svg width="160" height="60" viewBox="0 0 160 60">
    {/* Render actual SVG content so this fixture is visible in Storybook */}
    <TopArrowStem $state="up">
      <rect x="20" y="10" width="6" height="40" fill="black" rx="2" />
    </TopArrowStem>
    <TopArrowStem $state="down">
      <rect x="77" y="10" width="6" height="40" fill="black" rx="2" />
    </TopArrowStem>
    <TopArrowStem $state="both">
      <rect x="134" y="10" width="6" height="40" fill="black" rx="2" />
    </TopArrowStem>
  </svg>
);

const styles = stylex.create({
  topArrowStem: {
    opacity: 1,
    // Top of stem - where it connects to arrow head
    transformOrigin: "8px 4.5px",
    transition: "opacity 150ms ease,transform 150ms ease",
    transform: "scaleY(1)",
  },
});

const $stateVariants = stylex.create({
  down: {
    opacity: 0,
    transform: "scaleY(0)",
  },
  up: {
    transform: "scaleY(3.27)",
  },
  both: {
    opacity: 1,
    transform: "scaleY(1)",
  },
});
