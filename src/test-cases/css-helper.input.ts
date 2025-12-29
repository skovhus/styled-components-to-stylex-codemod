import styled, { css } from 'styled-components';

const truncate = css`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Title = styled.h1`
  ${truncate}
  font-size: 1.5em;
  color: #BF4F74;
`;

const Subtitle = styled.h2`
  ${truncate}
  font-size: 1em;
  color: #666;
`;

export const App = () => (
  <div>
    <Title>This is a very long title that will be truncated</Title>
    <Subtitle>This is a subtitle that will also be truncated</Subtitle>
  </div>
);