// Repro: Same pseudo selector or at-rule cannot be used more than once
// Pattern: dynamic borderColor override at default scope (ternary), then borderColor again under :focus
import styled from "styled-components";
import { themedBorder } from "./lib/helpers";

const JsonTextarea = styled.textarea<{ $hasError?: boolean }>`
  border: ${themedBorder("bgBorderFaint")};
  border-color: ${(props) => (props.$hasError ? props.theme.color.greenBase : undefined)};
  border-radius: 6px;

  &:focus {
    outline: none;
    border-color: ${(props) =>
      props.$hasError ? props.theme.color.greenBase : props.theme.color.controlPrimary};
  }
`;

// Prop-valued dynamic declaration inside a pseudo-class:
// the :hover gating must be preserved and the static base folded into `default`
const HoverSwatch = styled.button<{ $hoverColor: string }>`
  padding: 8px 16px;
  color: white;
  background-color: slategray;

  &:hover {
    background-color: ${(p) => p.$hoverColor};
  }
`;

// Same pattern but with an OPTIONAL prop: the folded `slategray` base must be
// preserved when the prop is absent. The style function therefore must be
// invoked unconditionally (not `prop != null && fn(prop)`), passing undefined.
const OptionalHoverSwatch = styled.button<{ $hoverColor?: string }>`
  padding: 8px 16px;
  color: white;
  background-color: slategray;

  &:hover {
    background-color: ${(p) => p.$hoverColor};
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <JsonTextarea defaultValue="default" />
    <JsonTextarea $hasError defaultValue="error" />
    <HoverSwatch $hoverColor="tomato">Hover me (tomato)</HoverSwatch>
    <HoverSwatch $hoverColor="seagreen">Hover me (seagreen)</HoverSwatch>
    <OptionalHoverSwatch>No hover prop (stays slategray)</OptionalHoverSwatch>
    <OptionalHoverSwatch $hoverColor="rebeccapurple">Hover me (purple)</OptionalHoverSwatch>
  </div>
);
