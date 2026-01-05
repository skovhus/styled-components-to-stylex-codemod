import styled from "styled-components";

type Props = { state: "up" | "down" | "both" };

const TopArrowStem = styled.g<{ $state: Props["state"] }>`
  opacity: ${(props) => (props.$state === "down" ? 0 : 1)};
  transform-origin: 8px 4.5px; /* Top of stem - where it connects to arrow head */
  transition: opacity 150ms ease, transform 150ms ease;
  transform: ${(props) => {
    if (props.$state === "up") {
      return "scaleY(3.27)"; /* Stretch down to match original SVG proportions (1.5 * 3.27 ≈ 4.9px) */
    }
    if (props.$state === "down") {
      return "scaleY(0)";
    }
    return "scaleY(1)"; /* Normal size for "both" state */
  }};
`;

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
