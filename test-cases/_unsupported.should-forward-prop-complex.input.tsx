// @expected-warning: Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)
import styled from "styled-components";

// This file contains shouldForwardProp patterns that cannot be safely transformed.
// The codemod should bail to avoid changing the semantics of prop forwarding.

// UNSUPPORTED: Forward $-prefixed props (opposite of filtering them)
// This pattern explicitly forwards transient props to the DOM, which we can't
// safely replicate without understanding the full intent.
export const ForwardTransient = styled.button.withConfig({
  shouldForwardProp: (prop) => prop.startsWith("$"),
})`
  background: #bf4f74;
`;

// UNSUPPORTED: Complex conditional logic
export const ComplexFilter = styled.button.withConfig({
  shouldForwardProp: (prop) => {
    if (prop === "disabled") return true;
    if (prop.startsWith("data-")) return true;
    return !prop.startsWith("$");
  },
})`
  background: #bf4f74;
`;

// UNSUPPORTED: External function reference
const isValidProp = (prop: string) => !prop.startsWith("$");
export const ExternalFn = styled.button.withConfig({
  shouldForwardProp: isValidProp,
})`
  background: #bf4f74;
`;

// UNSUPPORTED: Regex-based filtering
export const RegexFilter = styled.button.withConfig({
  shouldForwardProp: (prop) => !/^(on|aria)[A-Z]/.test(prop),
})`
  background: #bf4f74;
`;
