// styled(Component) inlined at a call site that spreads {...props} containing className/style.
// The codemod must merge StyleX output with the spread props, not clobber them.
import * as React from "react";
import styled from "styled-components";
import { ExternalComponent } from "./lib/external-component";

const StyledExternal = styled(ExternalComponent)`
  border-radius: 8px;
  padding: 8px;
  background-color: #f5f5f5;
`;

// Wrapper receives props from a parent that includes className and style.
// It spreads those props onto the styled component.
const Wrapper = (props: { children: React.ReactElement }) => (
  <StyledExternal
    isOpen
    onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.preventDefault()}
    {...props}
    id="popover-container"
  />
);

// Host passes className and style to its `component` prop.
// These must survive through Wrapper → StyledExternal → ExternalComponent.
function Host(props: {
  component: React.ComponentType<{
    children: React.ReactElement;
    className?: string;
    style?: React.CSSProperties;
  }>;
}) {
  const Component = props.component;
  return (
    <Component className="host-positioning" style={{ opacity: 0.95, border: "2px solid #333" }}>
      <div style={{ padding: 8 }}>Content inside wrapper</div>
    </Component>
  );
}

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <Host component={Wrapper} />
    </div>
  );
}
