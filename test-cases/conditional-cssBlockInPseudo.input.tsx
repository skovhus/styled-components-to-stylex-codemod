// Function interpolation inside a pseudo selector returning css blocks should not be silently dropped.
import styled, { css } from "styled-components";
import { highlightExpand } from "./lib/helpers";

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

const CardButton = styled.button<{ $interactive?: boolean }>`
  color: #334155;
  background-color: #f8fafc;

  ${(props) =>
    props.$interactive
      ? css`
          cursor: pointer;

          &:${highlightExpand} {
            background-color: ${props.theme.color.bgBaseHover};
            color: ${props.theme.color.labelTitle};
          }
        `
      : undefined}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
    <CardButton $interactive>Interactive</CardButton>
  </div>
);
