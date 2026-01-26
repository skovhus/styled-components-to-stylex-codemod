import styled from "styled-components";

type Size = "tiny" | "small" | "normal";

type Props = {
  /** The color of the badge. */
  color?: string;
  /** Whether to render a hollow badge. */
  hollow?: boolean;
  /** The size of the badge. */
  size?: Size;
};

/** Renders a rounded color badge, tweaked to look nice in the current theme. */
export const ColorBadge = styled("div")<Props>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;

  ${(props) =>
    props.hollow
      ? `border: solid 1px ${props.color ? props.color : props.theme.color.labelMuted}`
      : `background: ${props.color ? props.color : props.theme.color.labelMuted}`};

  ${(props) =>
    props.size === "tiny" &&
    `
    width: 7px;
    height: 7px;
  `};

  ${(props) =>
    props.size === "small" &&
    `
    width: 9px;
    height: 9px;
  `};
`;

export const App = () => (
  <div>
    <ColorBadge />
    <ColorBadge color="hotpink" />
    <ColorBadge hollow />
    <ColorBadge hollow color="hotpink" />
    <ColorBadge size="tiny" />
    <ColorBadge size="small" />
    <ColorBadge color="#ff0000" />
  </div>
);
