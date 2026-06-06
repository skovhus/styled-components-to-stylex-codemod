import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

type ContainerProps = {
  size: number;
  padding: number;
} & Omit<React.ComponentProps<"div">, "className" | "style" | "sx">;

export function Container(props: ContainerProps) {
  const { size, padding, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.container,
        styles.containerStyles({
          size,
          padding,
        }),
      ]}
    />
  );
}

type BranchedContainerProps = { size: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// css helper called from a function with if/else branches
export function BranchedContainer(props: BranchedContainerProps) {
  const { size, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.branchedContainer,
        Browser.isSafari
          ? styles.branchedContainerBrowserIsSafari(size)
          : styles.branchedContainerDefault(size),
      ]}
    />
  );
}

function RuntimeOffset({ children }: { children?: React.ReactNode }) {
  return (
    <div
      sx={[
        styles.runtimeOffset,
        Browser.isTouchDevice ? styles.runtimeOffsetBrowserIsTouchDevice : undefined,
        Browser.isTouchDevice && !Browser.isSafari
          ? styles.runtimeOffsetBrowserIsTouchDeviceNotBrowserIsSafari
          : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Container size={16} padding={4}>
      Hello World
    </Container>
    <BranchedContainer size={16}>Branched</BranchedContainer>
    <RuntimeOffset>Runtime touch offset</RuntimeOffset>
  </div>
);

const styles = stylex.create({
  containerStyles: (props: { size: number; padding: number }) => ({
    fontSize: `${props.size + props.padding}px`,
    lineHeight: `${props.size}px`,
  }),
  container: {
    display: "inline-flex",
  },
  // css helper called from a function with if/else branches
  branchedContainer: {
    display: "inline-flex",
  },
  branchedContainerBrowserIsSafari: (size: number) => ({
    fontSize: size - 4,
    lineHeight: 1,
  }),
  branchedContainerDefault: (size: number) => ({
    fontSize: size - 3,
    lineHeight: `${size}px`,
  }),
  runtimeOffset: {
    position: "relative",
    top: 1,
    left: -40,
    marginBlock: 8,
    marginInline: 12,
    paddingTop: "8px !important",
    paddingRight: "8px !important",
    paddingBottom: "8px !important",
    paddingLeft: "8px !important",
    backgroundColor: "peachpuff",
  },
  runtimeOffsetBrowserIsTouchDevice: {
    top: 5,
    marginBlock: 4,
    marginInline: 12,
    paddingTop: "4px !important",
    paddingRight: "4px !important",
    paddingBottom: "4px !important",
    paddingLeft: "4px !important",
  },
  runtimeOffsetBrowserIsTouchDeviceNotBrowserIsSafari: {
    left: -5,
  },
});
