import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type StepLineProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $faded: boolean;
};

function StepLine(props: StepLineProps) {
  const { children, $faded } = props;
  return (
    <div {...stylex.props(styles.stepLine, $faded ? styles.stepLineFaded : undefined)}>
      {children}
    </div>
  );
}

export const App = () => <StepLine $faded />;

const styles = stylex.create({
  stepLine: {
    flex: "1",
    width: "100px",
    height: "100px",
    backgroundImage: `linear-gradient(to bottom, ${$colors.bgSub} 70%, ${$colors.bgSub} 100%)`,
  },
  stepLineFaded: {
    backgroundImage: `linear-gradient(to bottom, ${$colors.bgSub} 70%, rgba(0, 0, 0, 0) 100%)`,
  },
});
