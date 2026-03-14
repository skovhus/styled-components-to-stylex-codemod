import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type Props = {
  src: string;
  alt?: string;
};

// Original styled component - spread props first, then override src
function Thumbnail(props: React.ComponentProps<"img">) {
  const { className, style, ...rest } = props;

  return <img {...rest} {...mergedSx(styles.thumbnail, className, style)} />;
}

export function SecureThumbnail(props: Props) {
  const secureSrc = `https://proxy.example.com/${props.src}`;
  return <Thumbnail {...props} src={secureSrc} />;
}

// Multiple spreads with explicit attr in between:
// The explicit attr foo="1" should stay between {...a} and {...b}
type BoxProps = { className?: string };

function Box(props: { "data-test"?: boolean | string } & React.ComponentProps<"div">) {
  const { className, children, style, ...rest } = props;

  return (
    <div {...rest} {...mergedSx(styles.box, className, style)}>
      {children}
    </div>
  );
}

export function MultiSpread(a: BoxProps, b: BoxProps) {
  return <Box {...a} data-test="middle" {...b} />;
}

export function App() {
  return <SecureThumbnail src="test.jpg" />;
}

const styles = stylex.create({
  thumbnail: {
    maxWidth: 180,
    objectFit: "cover",
  },
  box: {
    padding: 8,
  },
});
