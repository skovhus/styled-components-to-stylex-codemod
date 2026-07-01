import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type Props = {
  src: string;
  alt?: string;
};

// Original styled component - spread props first, then override src
function Thumbnail(props: { sx?: stylex.StyleXStyles } & React.ComponentProps<"img">) {
  const { className, style, sx, ...rest } = props;
  return <img {...rest} {...mergedSx([styles.thumbnail, sx], className, style)} />;
}

export function SecureThumbnail(props: Props) {
  const secureSrc = `https://proxy.example.com/${props.src}`;
  return <Thumbnail {...props} src={secureSrc} />;
}

// Multiple spreads with explicit attr in between:
// The explicit attr foo="1" should stay between {...a} and {...b}
type BoxProps = { className?: string } & { sx?: stylex.StyleXStyles };

function Box(
  props: {
    sx?: stylex.StyleXStyles;
    "data-test"?: boolean | string;
  } & React.ComponentProps<"div">,
) {
  const { className, style, sx, ...rest } = props;
  return <div {...rest} {...mergedSx([styles.box, sx], className, style)} />;
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
