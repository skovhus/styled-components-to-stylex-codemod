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
      sx={[
        styles.containerWrapper,
        $width || false ? styles.containerWrapperWithComponentWidth($width) : undefined,
      ]}
    >
      {children}
    </div>
  );
}

// A container that uses the CSS custom property with calc()
function Container(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.container}>{props.children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <ContainerWrapper $width={100}>
      <Container>Width: 100px + 60px = 160px</Container>
    </ContainerWrapper>
    <ContainerWrapper $width={200}>
      <Container>Width: 200px + 60px = 260px</Container>
    </ContainerWrapper>
    <ContainerWrapper $width={undefined}>
      <Container>Width: undefined (no custom property)</Container>
    </ContainerWrapper>
  </div>
);

const styles = stylex.create({
  containerWrapper: {
    overflow: "hidden",
  },
  containerWrapperWithComponentWidth: (width: number | undefined) => ({
    "--component-width": `${width}px`,
  }),
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
