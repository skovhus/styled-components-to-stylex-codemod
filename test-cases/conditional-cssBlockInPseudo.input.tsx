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
          opacity: ${(props: any) => (props.$background ? 1 : 0.8)};

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

const FocusAliasIcon = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${(props) =>
    props.$active &&
    css`
      &:focus:${highlight} {
        color: ${color("labelTitle")};
      }
    `}
`;

const AliasWithDefaultIcon = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${(props) =>
    props.$active &&
    css`
      color: #2563eb;

      &:focus {
        color: #16a34a;
      }

      &:${highlight} {
        color: ${color("labelTitle")};
      }
    `}
`;

const OrderedAliasIcon = styled.span<{ $active?: boolean; $color: string }>`
  display: inline-flex;
  padding: 4px 8px;
  color: ${(props) => props.$color};

  ${(props) =>
    props.$active &&
    css`
      &:${highlight} {
        color: #dc2626;
      }
    `}
`;

const DualAliasIcon = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #f8fafc;
  color: #334155;

  ${(props) =>
    props.$active &&
    css`
      &:${highlight} {
        background-color: ${color("bgBaseHover")};
      }

      &:focus:${highlight} {
        color: ${color("labelTitle")};
      }
    `}
`;

const MultiPseudoIcon = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${(props) =>
    props.$active &&
    css`
      &:hover {
        color: #dc2626;
      }

      &:focus {
        color: #2563eb;
      }
    `}
`;

const FiniteCssBlock = styled.span<{
  $enabled?: boolean;
  $visible?: boolean;
  $wide?: boolean;
  $image?: boolean;
}>`
  display: inline-flex;
  padding: 4px 8px;
  color: hotpink;
  background-color: blue;

  ${(props) =>
    props.$enabled &&
    css`
      opacity: ${(props: any) => (props.$visible ? 1 : 0)};
      pointer-events: ${(props: any) => (props.$visible ? "auto" : "none")};
      padding: ${(props: any) => (props.$wide ? "8px 16px" : "4px")};
      background: ${(props: any) => (props.$image ? "url(/icon.png)" : "red")};
      margin: ${(props: any) => (props.theme.isDark ? "8px 16px" : "4px")};
    `}
`;

export const App = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16, width: 718 }}>
    <Tab data-state="active">Active</Tab>
    <Tab data-state="inactive">Inactive</Tab>
    <CardButton $interactive>Interactive</CardButton>
    <IconWrapper $background="#fed7aa">Icon</IconWrapper>
    <IconWrapper>Plain icon</IconWrapper>
    <FalsyGuardIcon>Enabled icon</FalsyGuardIcon>
    <FalsyGuardIcon $disabled>Disabled icon</FalsyGuardIcon>
    <FocusAliasIcon $active tabIndex={0}>
      Focus alias
    </FocusAliasIcon>
    <AliasWithDefaultIcon $active tabIndex={0}>
      Alias default
    </AliasWithDefaultIcon>
    <OrderedAliasIcon $active $color="#2563eb">
      Alias order
    </OrderedAliasIcon>
    <DualAliasIcon $active tabIndex={0}>
      Dual alias
    </DualAliasIcon>
    <MultiPseudoIcon $active tabIndex={0}>
      Multi pseudo
    </MultiPseudoIcon>
    <FiniteCssBlock $enabled $visible $wide $image>
      Visible finite block
    </FiniteCssBlock>
    <FiniteCssBlock $enabled>Hidden finite block</FiniteCssBlock>
  </div>
);
