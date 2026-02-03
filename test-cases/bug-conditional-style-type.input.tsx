import * as React from "react";
import styled from "styled-components";

// Styled component with conditional CSS based on prop
// Uses ternary: props.$color ? `fill: ${props.$color};` : ""
// Bug: Codemod generates `$color && styles.fill($color)` which:
// - Returns "" (empty string) when $color is ""
// - Returns false when $color is undefined
// - Neither "" nor false are valid stylex.props() arguments
// This causes: TS2345: Argument of type '"" | readonly [...] | undefined'
//              is not assignable to parameter of type 'StyleXArray<...>'
export const IconWithTeamColor = styled.svg.attrs({
  className: "color-override",
})<{ $color?: string }>`
  ${(props) => (props.$color ? `fill: ${props.$color};` : "")};
`;

interface Props extends React.SVGProps<SVGSVGElement> {
  /** No target date */
  noDate?: boolean;
  /** Render a selected border */
  selected?: boolean;
}

/**
 * Renders a diamond shaped icon for the timeline
 */
export const IconWithTransform = styled(Icon_)`
  ${(p) =>
    p.noDate && !p.selected
      ? `
    transform: scale(0.66);
  `
      : ``}
`;

function Icon_(props: Props) {
  const { selected, noDate, ...etc } = props;
  return (
    <svg {...etc}>
      <circle cx="50" cy="50" r="40" stroke="green" strokeWidth="4" />
    </svg>
  );
}

export function App() {
  return (
    <div>
      <IconWithTeamColor $color="red">
        <circle cx="50" cy="50" r="40" stroke="green" strokeWidth="4" />
      </IconWithTeamColor>
      <IconWithTransform noDate selected />
      <IconWithTransform noDate />
    </div>
  );
}
