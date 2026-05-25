import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type BoxProps = {
  bg: string;
  text: string;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

function Box(props: BoxProps) {
  const { children, bg, text, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.box,
        bgVariants[bg as keyof typeof bgVariants] ?? styles.boxBg(bg),
        textVariants[text as keyof typeof textVariants] ?? styles.boxText(text),
      )}
    >
      {children}
    </Flex>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box bg="#bf4f74" text="white" gap={8}>
      Red
    </Box>
    <Box bg="#4f74bf" text="black" gap={12}>
      Blue
    </Box>
  </div>
);

const styles = stylex.create({
  box: {
    padding: 8,
  },
  boxBg: (bg: string) => ({
    backgroundColor: `${bg}`,
  }),
  boxText: (text: string) => ({
    color: `${text}`,
  }),
});

const bgVariants = stylex.create({
  "#bf4f74": {
    backgroundColor: "#bf4f74",
  },
  "#4f74bf": {
    backgroundColor: "#4f74bf",
  },
});

const textVariants = stylex.create({
  white: {
    color: "white",
  },
  black: {
    color: "black",
  },
});
