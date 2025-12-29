import styled, { ThemeProvider, useTheme } from 'styled-components';

const theme = {
  colors: {
    primary: '#BF4F74',
    secondary: '#4F74BF',
  },
};

const Button = styled.button`
  color: ${props => props.theme.colors.primary};
  background: white;
  border: 2px solid ${props => props.theme.colors.primary};
`;

const ThemeInfo = () => {
  const theme = useTheme();
  return <div>Current primary color: {theme.colors.primary}</div>;
};

export const App = () => (
  <ThemeProvider theme={theme}>
    <Button>Themed Button</Button>
    <ThemeInfo />
  </ThemeProvider>
);