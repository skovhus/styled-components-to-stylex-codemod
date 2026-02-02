import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

type ContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  myProp: number;
};

// The codemod should transform props.myProp to a parameter in the StyleX style function.
export function Container(props: ContainerProps) {
  const { children, myProp } = props;
  return (
    <div
      {...stylex.props(
        styles.container,
        Browser.isSafari
          ? styles.containerBrowserIsSafari(myProp)
          : styles.containerDefault(myProp),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => <Container myProp={16} />;

const styles = stylex.create({
  containerBrowserIsSafari: (myProp: number) => ({
    fontSize: `${myProp - 4}px`,
    lineHeight: 1,
  }),
  containerDefault: (myProp: number) => ({
    fontSize: `${myProp - 3}px`,
  }),

  // The codemod should transform props.myProp to a parameter in the StyleX style function.
  container: {
    display: "inline-flex",
  },
});
