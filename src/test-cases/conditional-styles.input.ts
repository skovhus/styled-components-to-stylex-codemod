import styled from 'styled-components';

const Title = styled.h1<{ $upsideDown?: boolean }>`
  ${props => props.$upsideDown && 'transform: rotate(180deg);'}
  text-align: center;
  color: #BF4F74;
`;

const Box = styled.div<{ $isActive?: boolean; $isDisabled?: boolean }>`
  padding: 1rem;
  background: ${props => props.$isActive ? 'mediumseagreen' : 'papayawhip'};
  opacity: ${props => props.$isDisabled ? 0.5 : 1};
  cursor: ${props => props.$isDisabled ? 'not-allowed' : 'pointer'};
`;

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title $upsideDown>Upside Down Title</Title>
    <Box>Normal Box</Box>
    <Box $isActive>Active Box</Box>
    <Box $isDisabled>Disabled Box</Box>
  </div>
);