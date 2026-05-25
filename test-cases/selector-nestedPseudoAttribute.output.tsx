import React from "react";
import * as stylex from "@stylexjs/stylex";

function MenuDiv(props: Omit<React.ComponentProps<"div">, "className" | "style" | "sx">) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={styles.menuDiv}>
      {children}
    </div>
  );
}

function InteractiveBox(props: Omit<React.ComponentProps<"div">, "className" | "style" | "sx">) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={styles.interactiveBox}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <MenuDiv tabIndex={0}>Menu (focus me)</MenuDiv>
      <MenuDiv tabIndex={0} data-highlighted="true">
        Menu (highlighted on focus)
      </MenuDiv>
      <InteractiveBox tabIndex={0}>Interactive Box</InteractiveBox>
      <InteractiveBox tabIndex={0} data-muted="true">
        Interactive Box (muted)
      </InteractiveBox>
      <InteractiveBox tabIndex={0} data-no-outline="true">
        Interactive Box (no outline)
      </InteractiveBox>
    </div>
  );
}

const styles = stylex.create({
  menuDiv: {
    backgroundColor: {
      default: "#f0f0f0",
      ":focus": "#bf4f74",
      ":focus-visible": "#bf4f74",
      ':focus:is([data-highlighted="true"])': "#2e86c1",
      ':focus-visible:is([data-highlighted="true"])': "#2e86c1",
    },
    padding: 16,
    overscrollBehavior: "none",
    color: {
      default: null,
      ":focus": "white",
      ":focus-visible": "white",
    },
  },
  interactiveBox: {
    backgroundColor: "white",
    padding: 12,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":hover": "#bf4f74",
      ':hover:is([data-muted="true"])': "#ddd",
    },
    opacity: {
      default: null,
      ':hover:is([data-muted="true"])': 0.5,
    },
    outline: {
      default: null,
      ":focus": "2px solid blue",
      ':focus:is([data-no-outline="true"])': "none",
    },
  },
});
