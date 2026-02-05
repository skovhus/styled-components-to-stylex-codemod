import styled from "styled-components";

// Bug: Two separate conditional interpolations (width and height) are collapsed into
// a single style function that only contains `height`. The `width` branch is lost
// entirely, so `Spacer width={100}` has no effect. Causes TS2353.

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
  <div>
    <Spacer width={100} height={50} />
    <Spacer width="2rem" />
    <Spacer height={0} />
    <Spacer />
  </div>
);
