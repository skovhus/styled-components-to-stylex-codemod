import React from "react";
import styled from "styled-components";

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

const StyledMenu = styled(BaseMenu)`
  min-width: 220px;
  padding-block: 10px;
  padding-inline: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid #2563eb;
  border-radius: 10px;
  background-color: #eef6ff;
`;

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
