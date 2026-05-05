import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const menuVars = stylex.defineVars({
  width: "240px",
});

type WidthMenuProps = React.PropsWithChildren<{
  $menuWidth?: number;
}>;

function WidthMenu(props: WidthMenuProps) {
  const { children, $menuWidth } = props;
  return (
    <div
      sx={[
        styles.widthMenu,
        $menuWidth ? styles.widthMenuMenuWidth($menuWidth) : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <WidthMenu>Default width</WidthMenu>
    <WidthMenu $menuWidth={320}>Custom width</WidthMenu>
  </div>
);

const styles = stylex.create({
  widthMenu: {
    width: menuVars.width,
    padding: 8,
    backgroundColor: "#fef3c7",
  },
  widthMenuMenuWidth: (menuWidth: number | undefined) => ({
    [menuVars.width]: `${menuWidth}px`,
  }),
});
