import styled from "styled-components";

const ConvertedChild = styled.span`
  display: inline-flex;
  opacity: 0;
  color: #2563eb;
`;

const PreservedContainer = styled.div`
  padding: 12px;
  background: #f8fafc;

  &:hover ${ConvertedChild} {
    opacity: 1;
  }

  & a.active {
    color: tomato;
  }
`;

export const App = () => (
  <PreservedContainer>
    <a className="active" href="#">
      Link
    </a>
    <ConvertedChild>Action</ConvertedChild>
  </PreservedContainer>
);
