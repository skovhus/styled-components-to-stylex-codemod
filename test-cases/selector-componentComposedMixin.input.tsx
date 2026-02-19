import styled, { css } from "styled-components";

const baseFill = css`
  fill: #bf4f74;
`;

const Link = styled.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`;

// The base fill value comes from a composed css helper mixin, not from
// a direct declaration. Reverse selector overrides must account for
// composed values when determining the default.
const Icon = styled.svg`
  ${baseFill}
  width: 48px;
  height: 48px;

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
