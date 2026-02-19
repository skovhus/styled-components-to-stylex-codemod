import React from "react";
import * as stylex from "@stylexjs/stylex";

// Static subcomponents referenced only via JSX namespaces.
const BaseMenu = (props: { children: React.ReactNode; className?: string }) => (
  <div className={props.className}>{props.children}</div>
);

BaseMenu.Section = (props: { title: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <strong>{props.title}</strong>
    {props.children}
  </div>
);

BaseMenu.Item = (props: { label: string }) => (
  <div
    style={{
      padding: "6px 8px",
      border: "1px solid #d0d7e2",
      borderRadius: 6,
      backgroundColor: "#ffffff",
    }}
  >
    {props.label}
  </div>
);

BaseMenu.Separator = () => (
  <div style={{ height: 2, backgroundColor: "#d0d7e2", borderRadius: 999 }} />
);

function StyledMenu(
  props: Omit<React.ComponentPropsWithRef<typeof BaseMenu>, "className" | "style">,
) {
  return <BaseMenu {...props} {...stylex.props(styles.styledMenu)} />;
}

StyledMenu.Section = (BaseMenu as any).Section;
StyledMenu.Item = (BaseMenu as any).Item;
StyledMenu.Separator = (BaseMenu as any).Separator;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Namespaces only</strong>
        <StyledMenu.Section title="Fruits">
          <StyledMenu.Item label="Apple" />
          <StyledMenu.Item label="Banana" />
        </StyledMenu.Section>
        <StyledMenu.Separator />
        <StyledMenu.Section title="Veggies">
          <StyledMenu.Item label="Carrot" />
        </StyledMenu.Section>
      </div>
    </div>
  );
}

const styles = stylex.create({
  styledMenu: {
    minWidth: "220px",
    paddingBlock: "10px",
    paddingInline: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#2563eb",
    borderRadius: "10px",
    backgroundColor: "#eef6ff",
  },
});
