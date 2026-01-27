import styled from "styled-components";

const StyledLink = styled.a<{ $allowTextSelection: boolean }>`
  color: #0a58ca;

  ${(props) =>
    props.$allowTextSelection &&
    `&,
     * {
       user-select: text;
     }`}
`;

export const App = () => (
  <StyledLink $allowTextSelection href="https://example.com">
    Selectable text
  </StyledLink>
);
