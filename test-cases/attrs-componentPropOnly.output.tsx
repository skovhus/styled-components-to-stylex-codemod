import * as React from "react";
import { Text } from "./lib/text";

function Title(props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">) {
  return <Text {...props} variant="title2" />;
}

export const App = () => (
  <div style={{ padding: "16px" }}>
    <Title>Hello World</Title>
  </div>
);
