// Nested attribute selectors inside pseudo-class selectors
import styled from "styled-components";

const MenuDiv = styled.div`
  background-color: #f0f0f0;
  padding: 16px;
  overscroll-behavior: none;

  &:focus,
  &:focus-visible {
    outline: none;
    &[data-disable-focus-ring="true"] {
      box-shadow: none;
    }
  }
`;

const InteractiveBox = styled.div`
  background-color: white;
  padding: 12px;
  border: 2px solid #ccc;

  &:hover {
    border-color: #bf4f74;
    &[data-muted="true"] {
      border-color: #ddd;
      opacity: 0.5;
    }
  }

  &:focus {
    outline: 2px solid blue;
    &[data-no-outline="true"] {
      outline: none;
    }
  }
`;

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
