// Function interpolation inside a pseudo selector returning css blocks should not be silently dropped.
import styled, { css } from "styled-components";

const Tab = styled.button`
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="active"] {
    ${(props) => {
      if (props.theme.isDark) {
        return css`
          background: ${props.theme.color.bgSub};
          box-shadow: 0 0 0 1px ${props.theme.color.bgBorderFaint};
        `;
      }
      return css`
        background: ${props.theme.color.bgBase};
        box-shadow: 0 0 0 1px ${props.theme.color.bgBorderFaint};
      `;
    }}
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
  </div>
);
