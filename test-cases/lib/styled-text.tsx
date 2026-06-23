import * as React from "react";
import styled from "styled-components";

export interface TextProps extends React.ComponentProps<"span"> {
  variant?: "mini" | "small" | "medium" | "large" | "title2";
  color?: "base" | "muted" | "labelBase" | "labelMuted";
}

export const Text = styled.span<TextProps>``;
