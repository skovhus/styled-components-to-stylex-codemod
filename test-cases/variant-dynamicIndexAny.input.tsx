import styled from "styled-components";

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
