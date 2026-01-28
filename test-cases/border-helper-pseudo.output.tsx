import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

type StyledHeaderProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLElement>;
}>;

export function StyledHeader(props: StyledHeaderProps) {
  const { children } = props;
  return <header {...stylex.props(styles.styledHeader)}>{children}</header>;
}

export const App = () => <StyledHeader />;

const styles = stylex.create({
  styledHeader: {
    display: "flex",
    borderBottomStyle: {
      default: null,
      ":not(:only-child)": "solid",
    },
    borderBottomColor: {
      default: null,
      ":not(:only-child)": "var(--settings-list-view-border-color)",
    },
    borderBottomWidth: {
      default: null,
      ":not(:only-child)": pixelVars.thin,
    },
  },
});
