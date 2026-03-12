// Dynamic style key deduplicates trailing word overlap between component name and CSS prop
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type MyBorderProps = React.PropsWithChildren<{
  borderWidth: number;
}>;

function MyBorder(props: MyBorderProps) {
  const { children, borderWidth } = props;

  return <div sx={[styles.myBorder, styles.myBorderWidth(borderWidth)]}>{children}</div>;
}

export function App() {
  return (
    <div style={{ padding: "16px" }}>
      <MyBorder borderWidth={2}>Bordered box</MyBorder>
    </div>
  );
}

const styles = stylex.create({
  myBorder: {
    borderStyle: "solid",
    borderColor: "black",
  },
  myBorderWidth: (borderWidth: number) => ({
    borderWidth: `${borderWidth}px`,
  }),
});
