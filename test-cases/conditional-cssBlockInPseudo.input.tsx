// Function interpolation inside a pseudo selector returning css blocks should not be silently dropped.
import styled, { css } from "styled-components";
import { color, glowShadow, highlight, highlightExpand, transitionSpeed } from "./lib/helpers";

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

const IconWrapper = styled.span<{ $background?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.$background || "transparent"};
  transition-property: background-color, border;
  transition-duration: ${transitionSpeed("normal")};

  ${(props) =>
    props.$background
      ? css`
          border-radius: 4px;

          &:${highlight} {
            background-color: ${color("bgBorderSolid")};
            border-color: ${color("bgBorderSolid")};
            box-shadow: ${glowShadow("dark")};
            transition-duration: ${transitionSpeed("fast")};
          }
        `
      : ""}
`;

const FalsyGuardIcon = styled.span<{ $disabled?: boolean }>`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #eef2ff;
  color: #312e81;

  ${(props) =>
    props.$disabled
      ? undefined
      : css`
          cursor: pointer;

          &:${highlight} {
            background-color: ${color("bgBaseHover")};
            color: ${color("labelTitle")};
          }
        `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
    <CardButton $interactive>Interactive</CardButton>
    <IconWrapper $background="#fed7aa">Icon</IconWrapper>
    <IconWrapper>Plain icon</IconWrapper>
    <FalsyGuardIcon>Enabled icon</FalsyGuardIcon>
    <FalsyGuardIcon $disabled>Disabled icon</FalsyGuardIcon>
  </div>
);
