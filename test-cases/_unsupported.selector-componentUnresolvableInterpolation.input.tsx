// @expected-warning: Unsupported selector: unresolved interpolation in reverse component selector
import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`;

// Reverse component selector with a prop-based ternary that can't be resolved to a theme value.
// The interpolation `${props => props.$active ? 'green' : 'gray'}` is not a theme access,
// so resolveThemeValue returns null and the declaration must not be silently dropped.
const Badge = styled.span`
  padding: 4px 8px;

  ${Link}:hover & {
    color: ${(props: { $active?: boolean }) => (props.$active ? "green" : "gray")};
  }
`;

export const App = () => (
  <Link href="#">
    <Badge>Label</Badge>
  </Link>
);
