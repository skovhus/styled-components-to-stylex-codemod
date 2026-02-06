import { animated, useSpring } from "./lib/react-spring";
import styled from "styled-components";

function ChevronHandle() {
  const [styles, api] = useSpring(() => ({
    d: "M2 3L11 5L20 3",
    y: 0,
  }));

  return (
    <svg width="22" height="6">
      <StyledPath d={styles.d} />
    </svg>
  );
}

const StyledPath = styled(animated.path)`
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
`;

export const App = () => <ChevronHandle />;
