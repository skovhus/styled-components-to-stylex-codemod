import * as React from "react";
import styled from "styled-components";

// A polymorphic Text component that defaults to span
type TextProps = React.PropsWithChildren<{
  variant?: "small" | "regular" | "large";
}>;

const Text = styled.span<TextProps>`
  font-size: ${(props) =>
    props.variant === "large" ? "18px" : props.variant === "small" ? "12px" : "14px"};
`;

// When .attrs({ as: "label" }) is used, the component should accept:
// 1. HTMLLabelElement-specific props like htmlFor
// 2. ref with type RefObject<HTMLLabelElement>
const Label = styled(Text).attrs({ as: "label" })<{ htmlFor?: string }>`
  cursor: pointer;
  user-select: none;
`;

export function FormField() {
  const labelRef = React.useRef<HTMLLabelElement>(null);

  return (
    <div>
      {/* ref should be typed as HTMLLabelElement since as="label" is set via attrs */}
      <Label ref={labelRef} htmlFor="input-id" variant="regular">
        Username
      </Label>
      <input id="input-id" type="text" />
    </div>
  );
}

export const App = () => <FormField />;
