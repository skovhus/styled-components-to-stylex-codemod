// Arrow functions with && returning template literal CSS blocks for size variants
import styled from "styled-components";

type Props = { size: "tiny" | "small" | "medium" };

const Indicator = styled.div<Props>`
  border-radius: 50%;
  background-color: green;

  ${(props) =>
    props.size === "tiny" &&
    `
    width: 7px;
    height: 7px;
  `}

  ${(props) =>
    props.size === "small" &&
    `
    width: 10px;
    height: 10px;
  `}

  ${(props) =>
    props.size === "medium" &&
    `
    width: 14px;
    height: 14px;
  `}
`;

export const App = () => (
  <div>
    <Indicator size="tiny" />
    <Indicator size="small" />
    <Indicator size="medium" />
  </div>
);
