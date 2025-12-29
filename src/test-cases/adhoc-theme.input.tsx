import styled, { ThemeProvider } from 'styled-components';

const theme = {
  main: '#BF4F74',
  secondary: '#4F74BF',
};

const Button = styled.button`
  padding: 8px 16px;
  background: ${props => props.theme.main};
  color: white;
  border: 2px solid ${props => props.theme.secondary};
  border-radius: 4px;
`;

export const App = () => (
  <ThemeProvider theme={theme}>
    <div>
      {/* Uses theme from context */}
      <Button>Default Theme</Button>

      {/* Ad-hoc theme override on specific instance */}
      <Button theme={{ main: '#4CAF50', secondary: '#2E7D32' }}>
        Green Override
      </Button>

      {/* Another ad-hoc override */}
      <Button theme={{ main: '#2196F3', secondary: '#1565C0' }}>
        Blue Override
      </Button>
    </div>
  </ThemeProvider>
);
