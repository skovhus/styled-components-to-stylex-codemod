// Pseudo-element declarations must stay scoped to the pseudo-element, not the parent.
import styled from "styled-components";
import { thinBorder } from "./lib/helpers";

const FramedCard = styled.div`
  position: relative;
  padding: 16px;
  background: white;
  border-radius: 12px;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #60a5fa, #f472b6);
    background-size: 200% 100%;
    background-position: 50% 0;
    pointer-events: none;
  }
`;

const DividerRow = styled.div`
  position: relative;
  min-height: 48px;
  padding: 12px 16px;
  background: #f8fafc;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 32px;
    right: 0;
    height: 0;
    border-top: 1px solid #cbd5e1;
    pointer-events: none;
  }
`;

const HelperDividerRow = styled.div`
  position: relative;
  min-height: 48px;
  padding: 12px 16px;
  background: #ecfdf5;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 32px;
    right: 0;
    height: 0;
    border-top: ${thinBorder("#16a34a")};
    pointer-events: none;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <FramedCard>Framed card</FramedCard>
    <DividerRow>Divider row</DividerRow>
    <HelperDividerRow>Helper divider row</HelperDividerRow>
  </div>
);
