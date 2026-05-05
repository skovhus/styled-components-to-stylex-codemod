// Custom property declarations should be emitted through defineVars instead of raw keys.
import styled from "styled-components";

const WidthMenu = styled.div<{ $menuWidth?: number }>`
  ${(props) => (props.$menuWidth ? `--menu-width: ${props.$menuWidth}px` : "")};
  width: var(--menu-width, 240px);
  padding: 8px;
  background: #fef3c7;
`;

const CollisionBox = styled.div`
  --foo-bar: 100px;
  --fooBar: 80px;
  width: var(--foo-bar, 100px);
  height: var(--fooBar, 80px);
  background: #dbeafe;
`;

const AlternateWidth = styled.div`
  --menu-width: 180px;
  width: var(--menu-width, 180px);
  padding: 8px;
  background: #fee2e2;
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <WidthMenu>Default width</WidthMenu>
    <WidthMenu $menuWidth={320}>Custom width</WidthMenu>
    <CollisionBox>Collision names</CollisionBox>
    <AlternateWidth>Alternate width</AlternateWidth>
  </div>
);
