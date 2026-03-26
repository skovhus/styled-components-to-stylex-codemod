// Conditional css blocks with theme.isDark ternary inside the template expression
import * as React from "react";
import styled, { css } from "styled-components";

interface InitialProps {
  $fontSize: number;
  /** Should the avatar render as inactive. */
  $isInactive?: boolean;
  /** Should the avatar render as for an invite. */
  $isInvite?: boolean;
  /** Whether the avatar should be rendered as disabled. */
  $isDisabled?: boolean;
}

const Thing = styled.div<InitialProps>`
  display: flex;
  ${(props) =>
    props.$isDisabled &&
    css`
      color: ${props.theme.isDark ? "#ffffff55" : "#FFFFFF"};
    `}
  ${(props) =>
    props.$isInactive
      ? css`
          background-color: ${props.theme.color.bgBorderSolid};
        `
      : ""};
  ${(props) =>
    props.$isInvite
      ? css`
          background-color: ${props.theme.color.bgBase};
        `
      : ""};
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Thing $fontSize={14} $isDisabled>
      Disabled
    </Thing>
    <Thing $fontSize={14} $isInactive>
      Inactive
    </Thing>
    <Thing $fontSize={14} $isInvite>
      Invite
    </Thing>
    <Thing $fontSize={14}>Default</Thing>
  </div>
);
