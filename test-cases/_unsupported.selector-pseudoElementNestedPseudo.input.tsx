// @expected-warning: Unsupported selector: pseudo-class on pseudo-element selector
//
// This is a parent-state pseudo-element case: styled-components emits `.root:hover::after` and
// `.root:focus-within::before`, where the parent state changes the pseudo-element. The old supported
// output passed static Storybook screenshots but failed an interactive Playwright check: hovering or
// focusing the input side changed the pseudo-element, while the StyleX side did not. This appears to
// be a StyleX selector-shape limitation for parent-state pseudo-element styling, so the codemod must
// bail instead of emitting `::after { backgroundColor: { ":hover": ... } }`.
import styled from "styled-components";

const ResizeHandle = styled.div`
  position: relative;
  height: 24px;
  cursor: ns-resize;

  &::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    top: 10px;
    height: 4px;
    border-radius: 999px;
    background-color: #cbd5e1;
  }

  &:hover::after {
    background-color: #64748b;
  }
`;

const FocusPanel = styled.div`
  position: relative;
  padding: 16px;
  border-radius: 8px;
  background-color: white;

  &::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: 9px;
    pointer-events: none;
    background-image: linear-gradient(to bottom, #cbd5e1, #e2e8f0);
    transition: background-image 120ms ease-out;
  }

  &:focus-within::before {
    background-image: linear-gradient(to bottom, #6366f1, #a5b4fc);
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16, width: 260 }}>
    <ResizeHandle />
    <FocusPanel>
      <button type="button">Focus panel</button>
    </FocusPanel>
  </div>
);
