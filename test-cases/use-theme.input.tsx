import * as React from "react";
import styled, { useTheme } from "styled-components";
import { color } from "./lib/helpers";

type InputProps = {
  /** id for accessibility focus from label */
  id?: string;
};

/**
 * Color input, in the form of a clickable square that opens up a color picker
 */
export function Input(props: InputProps) {
  const theme = useTheme();
  const someCustomColor = theme.color.bgBase;

  return <ColorPickerWrapper style={{ backgroundColor: someCustomColor }} />;
}

const ColorPickerWrapper = styled.div`
  width: auto;
  height: 10px;
  background: ${color("bgBase")};
  box-shadow: 0 2px 4px ${(props) => props.theme.color.primaryColor};
  border-radius: 8px;
  display: flex;
  border: 1px solid ${color("bgSub")};
  min-width: 300px;
  padding: 12px;
`;

export const App = () => <Input />;
