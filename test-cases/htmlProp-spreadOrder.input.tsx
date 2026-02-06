import * as React from "react";
import styled from "styled-components";

type Props = {
  src: string;
  alt?: string;
};

// Original styled component - spread props first, then override src
const Thumbnail = styled.img`
  max-width: 180px;
  object-fit: cover;
`;

export function SecureThumbnail(props: Props) {
  const secureSrc = `https://proxy.example.com/${props.src}`;
  return <Thumbnail {...props} src={secureSrc} />;
}

// Multiple spreads with explicit attr in between:
// The explicit attr foo="1" should stay between {...a} and {...b}
type BoxProps = { className?: string };
const Box = styled.div`
  padding: 8px;
`;

export function MultiSpread(a: BoxProps, b: BoxProps) {
  return <Box {...a} data-test="middle" {...b} />;
}

export function App() {
  return <SecureThumbnail src="test.jpg" />;
}
