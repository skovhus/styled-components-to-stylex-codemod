import styled from "styled-components";

// Bug: The output references a bare `color` variable that was never destructured
// from props (`color != null && styles.badgeBackgroundColor(color)`).
// The `color` prop should be extracted as `props.color`. Causes TS2304/TS7053.

type Size = "tiny" | "small" | "normal";

type Props = {
  color?: string;
  size?: Size;
};

export const Badge = styled("div")<Props>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${(props) => props.color || "gray"};

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
  <div style={{ display: "flex", gap: 8 }}>
    <Badge color="red" size="tiny" />
    <Badge color="blue" size="small" />
    <Badge color="green" />
    <Badge />
  </div>
);
