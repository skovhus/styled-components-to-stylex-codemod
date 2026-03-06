import React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => {
  return (
    <div sx={styles.header}>
      <FullWidthCopyText as="label">Invite link</FullWidthCopyText>
    </div>
  );
};

function FullWidthCopyText<C extends React.ElementType = "div">(
  props: Omit<React.ComponentPropsWithRef<C>, "className" | "style"> & { as?: C },
) {
  const { as: Component = "div", children, ...rest } = props;

  return (
    <Component {...rest} sx={styles.fullWidthCopyText}>
      {children}
    </Component>
  );
}

const styles = stylex.create({
  header: {
    marginBottom: "4px",
  },
  fullWidthCopyText: {
    width: "100%",
  },
});
