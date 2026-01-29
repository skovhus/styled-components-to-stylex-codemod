import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Props = {
  src: string;
  alt?: string;
};

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
  return <img {...props} {...stylex.props(styles.thumbnail)} src={secureSrc} />;
}

export function App() {
  return <SecureThumbnail src="test.jpg" />;
}

const styles = stylex.create({
  // Original styled component - spread props first, then override src
  thumbnail: {
    maxWidth: "180px",
    objectFit: "cover",
  },
});
