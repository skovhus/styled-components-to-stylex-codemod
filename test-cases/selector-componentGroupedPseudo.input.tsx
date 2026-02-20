import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`;

// Grouped reverse selectors: ${Link}:focus-visible &, ${Link}:active &
// Multiple pseudo branches in a single selector.
const Badge = styled.span`
  padding: 4px 8px;
  color: gray;

  ${Link}:focus-visible &, ${Link}:active & {
    color: blue;
  }
`;

export const App = () => (
  <Link href="#">
    <Badge>Badge (blue on focus-visible OR active)</Badge>
  </Link>
);
