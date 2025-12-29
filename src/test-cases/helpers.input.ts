import styled, { ThemeProvider } from 'styled-components';
import { color, truncate, flexCenter } from './lib/helpers';
import { theme } from './lib/theme';

// Using theme accessor helper
const Button = styled.button`
  padding: 0.5em 1em;
  background-color: ${color('primary')};
  color: ${color('background')};
  border: 2px solid ${color('secondary')};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${color('secondary')};
  }
`;

// Using CSS snippet helper for truncation
const TruncatedText = styled.p`
  ${truncate()}
  max-width: 200px;
  font-size: 14px;
  color: ${color('text')};
`;

// Using CSS snippet helper for flex centering
const CenteredContainer = styled.div`
  ${flexCenter()}
  min-height: 100px;
  background-color: ${color('background')};
  border: 1px solid ${color('secondary')};
`;

// Combining multiple helpers
const Card = styled.div`
  padding: 1em;
  background-color: ${color('background')};
  border: 1px solid ${color('secondary')};
  border-radius: 8px;
`;

const CardTitle = styled.h3`
  ${truncate()}
  margin: 0 0 0.5em 0;
  color: ${color('primary')};
  font-size: 18px;
`;

export const App = () => (
  <ThemeProvider theme={theme}>
    <CenteredContainer>
      <Card>
        <CardTitle>This is a very long title that should be truncated</CardTitle>
        <TruncatedText>
          This is some text content that will be truncated if it gets too long.
        </TruncatedText>
        <Button>Click me</Button>
      </Card>
    </CenteredContainer>
  </ThemeProvider>
);
