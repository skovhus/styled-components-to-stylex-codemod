import * as React from "react";
import styled from "styled-components";

// Simplified Text component for test case
type TextProps = React.PropsWithChildren<{
  as?: React.ElementType;
  variant?: "small" | "regular" | "large";
  className?: string;
  style?: React.CSSProperties;
}>;

const Text = styled.span<TextProps>`
  font-size: ${(props) =>
    props.variant === "large" ? "18px" : props.variant === "small" ? "12px" : "14px"};
  line-height: 1.5;
`;

/**
 * Label component that can be used with htmlFor to target an input.
 * Uses .attrs({ as: "label" }) to set the element type.
 */
export const Label = styled(Text).attrs({ as: "label" })<{ htmlFor?: string }>`
  cursor: pointer;
  user-select: none;
`;

export function FormField() {
  // When .attrs({ as: "label" }) is used, ref should be typed as HTMLLabelElement
  const labelRef = React.useRef<HTMLLabelElement>(null);

  return (
    <div>
      <Label ref={labelRef} htmlFor="input-id" variant="regular">
        Username
      </Label>
      <input id="input-id" type="text" />
    </div>
  );
}

export const App = () => <FormField />;
