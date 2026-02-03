import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

type TextProps = React.PropsWithChildren<{
  $truncate?: boolean;
}>;

// Helper call in conditional - should apply truncation when truthy
function Text(props: TextProps) {
  const { children, $truncate } = props;
  return <p {...stylex.props(styles.text, $truncate ? helpers.truncate : undefined)}>{children}</p>;
}

type TextAltProps = React.PropsWithChildren<{
  $noTruncate?: boolean;
}>;

// Helper call in alternate - should apply truncation when falsy
function TextAlt(props: TextAltProps) {
  const { children, $noTruncate } = props;
  return <p {...stylex.props(styles.textAlt, !$noTruncate && helpers.truncate)}>{children}</p>;
}

type TitleProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  maxWidth?: number;
  $truncateTitle?: boolean;
};

function Title(props: TitleProps) {
  const { children, maxWidth, $truncateTitle } = props;
  return (
    <div
      {...stylex.props(
        styles.title,
        $truncateTitle ? helpers.truncate : undefined,
        maxWidth ? styles.titleMaxWidth(maxWidth) : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ width: 200, border: "1px solid #ccc", padding: 8 }}>
    <Title $truncateTitle maxWidth={200}>
      Truncated title
    </Title>
    <Text>Normal text without truncation that can wrap to multiple lines</Text>
    <Text $truncate>
      Truncated text that will have ellipsis when it overflows the container width
    </Text>
    <TextAlt $noTruncate>Normal text without truncation that can wrap to multiple lines</TextAlt>
    <TextAlt>Truncated text that will have ellipsis when it overflows</TextAlt>
  </div>
);

const styles = stylex.create({
  text: {
    fontSize: "14px",
  },
  textAlt: {
    fontSize: "14px",
  },
  title: {
    fontSize: "50px",
  },
  titleMaxWidth: (maxWidth: number) => ({
    maxWidth,
  }),
});
