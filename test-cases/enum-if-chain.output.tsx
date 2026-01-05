import * as stylex from "@stylexjs/stylex";
type Props = { state: "up" | "down" | "both" };

const styles = stylex.create({
  topArrowStem: {
    opacity: 1,
    transformOrigin: "8px 4.5px",
    /* Top of stem - where it connects to arrow head */
    transition: "opacity 150ms ease,transform 150ms ease",
    transform: "scaleY(1)",
  },
  topArrowStemStateDown: {
    opacity: 0,
    transform: "scaleY(0)",
  },
  topArrowStemStateUp: {
    transform: "scaleY(3.27)",
  },
});

function TopArrowStem(props) {
  const { className, children, style, $state } = props;

  const sx = stylex.props(
    styles.topArrowStem,
    $state === "down" && styles.topArrowStemStateDown,
    $state === "up" && styles.topArrowStemStateUp,
  );

  return (
    <g
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </g>
  );
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
