import * as React from "react";
import styled from "styled-components";

export const ContentViewContainer = styled.div`
  display: flex;
  flex-grow: 1;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  position: relative;
`;

// Pattern 2: styled(Component) with explicit props type that needs adapter-driven `as` support.
// The adapter returns { as: true } for this file, so the generated type must:
// 1. Include the user's explicit props (CustomProps)
// 2. Add the generic `as?: C` prop
// 3. Create a proper generic wrapper function
const BaseComponent = (props: React.ComponentProps<"div">) => <div {...props} />;

interface CustomProps {
  /** A custom prop specific to this wrapper */
  variant: "primary" | "secondary";
}

export const StyledWrapper = styled(BaseComponent)<CustomProps>`
  padding: 16px;
  background: ${(props) => (props.variant === "primary" ? "blue" : "gray")};
`;

// When this is used externally we might both add a ref and use the "as"
// <ContentViewContainer ref={...} onClick={e => {}} >
export const App = () => (
  <>
    <ContentViewContainer onClick={() => {}} />
    <StyledWrapper variant="primary">Content</StyledWrapper>
  </>
);
