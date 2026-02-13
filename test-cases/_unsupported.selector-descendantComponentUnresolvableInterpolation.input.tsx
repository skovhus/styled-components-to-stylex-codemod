// @expected-warning: Unsupported selector: unresolved interpolation in descendant component selector
import styled from "styled-components";

const Icon = styled.span`
  width: 16px;
  height: 16px;
`;

// Forward descendant selector with unresolvable prop-based interpolation.
// The interpolation can't be resolved to a theme value, so should bail.
const Button = styled.button`
  padding: 8px;

  &:hover ${Icon} {
    color: ${(props: { $color?: string }) => props.$color ?? "red"};
  }
`;

export const App = () => (
  <Button>
    <Icon />
    Click
  </Button>
);
