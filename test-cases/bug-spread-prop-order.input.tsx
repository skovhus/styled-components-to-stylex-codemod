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

// Bug: When converting styled component usage, the codemod generates:
//   <img src={secureSrc} {...stylex.props(styles.thumbnail)} {...props} />
// But should generate:
//   <img {...props} {...stylex.props(styles.thumbnail)} src={secureSrc} />
//
// The original had: <Thumbnail {...props} src={secureSrc} />
// which means props are spread first, then src is overridden.
// This causes: TS2783: 'src' is specified more than once
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
