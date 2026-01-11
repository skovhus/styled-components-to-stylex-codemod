import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TitleProps = React.PropsWithChildren<{
  $upsideDown?: boolean;
}>;

function Title(props: TitleProps) {
  const { children, $upsideDown } = props;
  return <h1 {...stylex.props(styles.title, $upsideDown && styles.titleUpsideDown)}>{children}</h1>;
}

type BoxProps = React.PropsWithChildren<{
  $isActive?: boolean;
  $isDisabled?: boolean;
}>;

function Box(props: BoxProps) {
  const { children, $isActive, $isDisabled } = props;
  return (
    <div
      {...stylex.props(
        styles.box,
        $isActive && styles.boxActive,
        $isDisabled && styles.boxDisabled,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title $upsideDown>Upside Down Title</Title>
    <Box>Normal Box</Box>
    <Box $isActive>Active Box</Box>
    <Box $isDisabled>Disabled Box</Box>
  </div>
);

const styles = stylex.create({
  title: {
    textAlign: "center",
    color: "#BF4F74",
  },
  titleUpsideDown: {
    transform: "rotate(180deg)",
  },
  box: {
    padding: "1rem",
    backgroundColor: "papayawhip",
    opacity: 1,
    cursor: "pointer",
  },
  boxActive: {
    backgroundColor: "mediumseagreen",
  },
  boxDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
});
