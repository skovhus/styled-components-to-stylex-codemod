import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { cssVariableDefineVarsDeclarationInputVariables } from "./cssVariable-defineVarsDeclaration.input.stylex";

type WidthMenuProps = React.PropsWithChildren<{
  menuWidth?: number;
}>;

function WidthMenu(props: WidthMenuProps) {
  const { children, menuWidth } = props;
  const sx = stylex.props(styles.widthMenu);

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--menu-width": menuWidth ? `${menuWidth}px` : undefined,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <WidthMenu>Default width</WidthMenu>
    <WidthMenu menuWidth={320}>Custom width</WidthMenu>
    <div sx={styles.collisionBox}>Collision names</div>
    <div sx={styles.alternateWidth}>Alternate width</div>
  </div>
);

const styles = stylex.create({
  widthMenu: {
    width: cssVariableDefineVarsDeclarationInputVariables["--menu-width"],
    padding: 8,
    backgroundColor: "#fef3c7",
  },
  collisionBox: {
    [cssVariableDefineVarsDeclarationInputVariables["--foo-bar"]]: "100px",
    [cssVariableDefineVarsDeclarationInputVariables["--fooBar"]]: "80px",
    width: cssVariableDefineVarsDeclarationInputVariables["--foo-bar"],
    height: cssVariableDefineVarsDeclarationInputVariables["--fooBar"],
    backgroundColor: "#dbeafe",
  },
  alternateWidth: {
    "--menu-width": "180px",
    width: cssVariableDefineVarsDeclarationInputVariables["--menu-width"],
    padding: 8,
    backgroundColor: "#fee2e2",
  },
});
