import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerWrapperProps = React.PropsWithChildren<{
  $width: number | undefined;
}>;

// A wrapper that conditionally sets a CSS custom property based on prop
function ContainerWrapper(props: ContainerWrapperProps) {
  const { children, $width } = props;
  return (
    <div
      {...stylex.props(
        styles.containerWrapper,
        props.$width || false
          ? styles.containerWrapperCondTruthy({
              width: props.$width,
            })
          : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <ContainerWrapper $width={100}>
      <div {...stylex.props(styles.container)}>Width: 100px + 60px = 160px</div>
    </ContainerWrapper>
    <ContainerWrapper $width={200}>
      <div {...stylex.props(styles.container)}>Width: 200px + 60px = 260px</div>
    </ContainerWrapper>
    <ContainerWrapper $width={undefined}>
      <div {...stylex.props(styles.container)}>Width: undefined (no custom property)</div>
    </ContainerWrapper>
  </div>
);

const styles = stylex.create({
  containerWrapperCondTruthy: (props: { width: number }) => ({
    "--component-width": `${props.width}px`,
  }),

  // A wrapper that conditionally sets a CSS custom property based on prop
  containerWrapper: {
    overflow: "hidden",
  },

  // A container that uses the CSS custom property with calc()
  container: {
    backgroundColor: "coral",
    width: "calc(var(--component-width) + 60px)",
    height: "100px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontWeight: "bold",
  },
});
