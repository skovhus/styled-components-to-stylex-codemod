import styled from "styled-components";

type Props = {
  width?: number | string;
  height?: number | string;
};

const getSize = (size?: number | string) => {
  if (!size || typeof size === "number") {
    return `${size}px`;
  }
  return size;
};

const showProperty = (size?: number | string) => {
  return !!size || size === 0;
};

export const Spacer = styled.div<Props>`
  ${(props) => (showProperty(props.width) ? `width: ${getSize(props.width)}` : "")};
  ${(props) => (showProperty(props.height) ? `height: ${getSize(props.height)}` : "")};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Spacer width={100} height={50} style={{ background: "#cce5ff" }} />
    <Spacer width="2rem" style={{ background: "#d4edda", height: 20 }} />
    <Spacer height={0} style={{ background: "#fff3cd", width: 40 }} />
    <Spacer style={{ background: "#f8d7da", width: 20, height: 20 }} />
  </div>
);
