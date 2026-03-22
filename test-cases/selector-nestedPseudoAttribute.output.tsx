import React from "react";
import * as stylex from "@stylexjs/stylex";

function MenuDiv(
  props: { "data-disable-focus-ring"?: boolean | string } & Pick<
    React.ComponentProps<"div">,
    "children" | "tabIndex"
  >,
) {
  const { children, ...rest } = props;
  return (
    <div {...rest} sx={styles.menuDiv}>
      {children}
    </div>
  );
}

function InteractiveBox(
  props: {
    "data-muted"?: boolean | string;
    "data-no-outline"?: boolean | string;
  } & Pick<React.ComponentProps<"div">, "children" | "tabIndex">,
) {
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
      <MenuDiv tabIndex={0} data-disable-focus-ring="true">
        Menu (focus ring disabled)
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
    backgroundColor: "#f0f0f0",
    padding: 16,
    overscrollBehavior: "none",
    outline: {
      default: null,
      ":focus": "none",
      ":focus-visible": "none",
    },
    boxShadow: {
      default: null,
      ':focus:is([data-disable-focus-ring="true"])': "none",
      ':focus-visible:is([data-disable-focus-ring="true"])': "none",
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
