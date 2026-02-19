import styled from "styled-components";

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
  color: #bf4f74;
`;

// The reverse component selector appears BEFORE the base fill declaration.
// The base value must still be preserved as the default in the override.
const Icon = styled.svg`
  ${Link}:hover & {
    fill: rebeccapurple;
  }

  flex: none;
  width: 48px;
  height: 48px;
  fill: #bf4f74;
`;

export const App = () => (
  <Link href="#">
    <Icon viewBox="0 0 20 20">
      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
    </Icon>
    Hover me
  </Link>
);
