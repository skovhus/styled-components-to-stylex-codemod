import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type TopContainerProps = { accentColor?: string } & Omit<
  React.ComponentPropsWithRef<typeof SxAwareButton>,
  "$accentColor"
>;

export function TopContainer(props: TopContainerProps) {
  const { sx, accentColor, ...rest } = props;
  return <SxAwareButton {...rest} sx={[styles.topContainerColor(accentColor), sx]} />;
}

export const App = () => (
  <TopContainer accentColor="rgb(20, 60, 90)" sx={styles.accountSwitcherContainer}>
    Account
  </TopContainer>
);

const styles = stylex.create({
  topContainerColor: (accentColor: string | undefined) => ({
    color: `${accentColor ?? "black"}`,
  }),
  accountSwitcherContainer: {
    marginLeft: 4,
  },
});
