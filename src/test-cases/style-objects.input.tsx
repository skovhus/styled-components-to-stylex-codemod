import styled from 'styled-components';

const StaticBox = styled.div({
  background: '#BF4F74',
  height: '50px',
  width: '50px',
  borderRadius: '4px',
});

const DynamicBox = styled.div<{ $background?: string; $size?: string }>(props => ({
  background: props.$background || '#BF4F74',
  height: props.$size || '50px',
  width: props.$size || '50px',
  borderRadius: '4px',
}));

export const App = () => (
  <div>
    <StaticBox />
    <DynamicBox $background="mediumseagreen" $size="100px" />
  </div>
);