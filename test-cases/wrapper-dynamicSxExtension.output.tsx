import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type TopContainerProps = { electronYTrafficLightPosition?: number } & React.ComponentPropsWithRef<
  typeof SxAwareButton
>;

export function TopContainer(props: TopContainerProps) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      sx={[styles.topContainerPaddingLeft(props.electronYTrafficLightPosition), sx]}
    >
      {children}
    </SxAwareButton>
  );
}

export const App = () => (
  <TopContainer electronYTrafficLightPosition={12} sx={styles.accountSwitcherContainer}>
    Account
  </TopContainer>
);

const styles = stylex.create({
  topContainerPaddingLeft: (electronYTrafficLightPosition: number | undefined) => ({
    paddingLeft: `${electronYTrafficLightPosition ?? 0}px`,
  }),
  accountSwitcherContainer: {
    marginLeft: 4,
  },
});
