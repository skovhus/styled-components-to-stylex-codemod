import * as React from "react";
import styled from "styled-components";

export enum Status {
  active = "active",
  inactive = "inactive",
}

// Styled component with conditional CSS based on prop
// Uses ternary: props.$color ? `fill: ${props.$color};` : ""
export const IconWithTeamColor = styled.svg.attrs({
  className: "color-override",
})<{ $color?: string }>`
  ${(props) => (props.$color ? `fill: ${props.$color};` : "")};
`;

interface Props extends React.SVGProps<SVGSVGElement> {
  status: Status;
  noDate?: boolean;
  selected?: boolean;
}

/**
 * Renders a diamond shaped icon for the timeline
 */
export const IconWithTransform = styled(Icon_)`
  ${(p) =>
    p.noDate && !p.selected && p.status === Status.active
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
      <IconWithTransform noDate selected status={Status.active} />
      <IconWithTransform noDate selected status={Status.inactive} />
      <IconWithTransform noDate status={Status.active} />
    </div>
  );
}
