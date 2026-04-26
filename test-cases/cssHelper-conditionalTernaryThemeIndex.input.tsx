// CSS helper with conditional ternary branches and theme indexed lookup
import * as React from "react";
import styled, { css } from "styled-components";
import type { Colors } from "./lib/colors";

const Thing = styled.div<{ outlined: boolean; color?: Colors }>`
  display: flex;
  ${(props) =>
    props.outlined
      ? css`
          outline: 1px solid
            ${props.color ? props.theme.color[props.color] : props.theme.color.labelMuted};
        `
      : css`
          background: ${
            props.color ? props.theme.color[props.color] : props.theme.color.labelMuted
          };
        `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
    <Thing outlined>Outlined default</Thing>
    <Thing outlined color="labelBase">
      Outlined custom
    </Thing>
    <Thing outlined={false}>Background default</Thing>
    <Thing outlined={false} color="labelBase">
      Background custom
    </Thing>
  </div>
);
