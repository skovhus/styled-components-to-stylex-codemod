import styled from "styled-components";

// Styled component with an interpolated constant that must be declared before styles
const dynamicColor = "#BF4F74";

const StyledButton = styled.button`
  background: ${dynamicColor};
  padding: 8px;
`;

// Object with method containing JSX - this should NOT be treated as module-level usage
// because the method body executes at runtime, not during module initialization
const viewConfig = {
  render() {
    return <StyledButton>Click me</StyledButton>;
  },
};

export const App = () => viewConfig.render();
