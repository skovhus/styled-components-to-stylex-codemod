import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";
import { Text } from "./lib/text";

function Title(props: { children?: React.ReactNode }) {
  return <Text {...props} variant="title2" />;
}

function ErrorContainer(props: { children?: React.ReactNode }) {
  return (
    <Flex
      {...props}
      column={true}
      gap={16}
      align="center"
      {...stylex.props(styles.errorContainer)}
    />
  );
}

export const App = () => (
  <div style={{ padding: "16px" }}>
    <Title>Hello World</Title>
    <ErrorContainer>
      <span>Something went wrong</span>
    </ErrorContainer>
  </div>
);

const styles = stylex.create({
  errorContainer: {
    width: "100%",
    marginTop: 16,
  },
});
