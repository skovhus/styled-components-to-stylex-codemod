import * as React from "react";
import styled, { css } from "styled-components";

export interface FlexProps extends React.ComponentProps<"div"> {
  align?: string;
  alignSelf?: string;
  auto?: boolean;
  center?: boolean;
  column?: boolean;
  direction?: "row" | "column";
  disabled?: boolean;
  gap?: number;
  grow?: number;
  inline?: boolean;
  justify?: string;
  noMinHeight?: boolean;
  noMinWidth?: boolean;
  overflowHidden?: boolean;
  reverse?: boolean;
  shrink?: number;
  wrap?: boolean;
  wrapGap?: number;
}

const ALIGN_TO_CSS: Record<NonNullable<FlexProps["align"]>, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

export const Flex = styled.div<FlexProps>`
  display: flex;
  ${({ column, direction }) =>
    column
      ? css`
          flex-direction: column;
        `
      : direction
        ? css`
            flex-direction: ${direction};
          `
        : ""}
  ${({ gap }) =>
    gap !== undefined
      ? css`
          gap: ${gap}px;
        `
      : ""}
  ${({ align }) =>
    align
      ? css`
          align-items: ${ALIGN_TO_CSS[align]};
        `
      : ""}
  ${({ justify }) =>
    justify
      ? css`
          justify-content: ${justify};
        `
      : ""}
  ${({ center }) =>
    center
      ? css`
          align-items: center;
          justify-content: center;
        `
      : ""}
`;
