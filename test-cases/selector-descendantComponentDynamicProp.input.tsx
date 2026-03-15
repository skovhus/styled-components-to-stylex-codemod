// Forward descendant component selector with dynamic prop-based interpolation
import styled from "styled-components";

const Icon = styled.span`
  width: 16px;
  height: 16px;
`;

// Forward descendant selector with prop-based interpolation.
// The prop value is bridged to the child via a CSS custom property.
const Button = styled.button<{ $color?: string }>`
  padding: 8px;

  &:hover ${Icon} {
    color: ${(props) => props.$color ?? "red"};
  }
`;

export const App = () => (
  <Button>
    <Icon />
    Click
  </Button>
);
