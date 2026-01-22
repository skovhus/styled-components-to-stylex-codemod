import styled from "styled-components";

const Link = styled.a`
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: papayawhip;
  color: #BF4F74;
`;

const Icon = styled.svg`
  flex: none;
  width: 48px;
  height: 48px;
  fill: #BF4F74;
  transition: fill 0.25s;

  ${Link}:hover & {
    fill: rebeccapurple;
  }
`;

export const App = () => (
  <Link href="#">
    <Icon viewBox="0 0 20 20">
      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
    </Icon>
    Hover me
  </Link>
);
