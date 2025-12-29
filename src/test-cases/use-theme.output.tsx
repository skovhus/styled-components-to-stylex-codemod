import * as stylex from '@stylexjs/stylex';
import { themeVars } from './tokens.stylex';

const styles = stylex.create({
  button: {
    color: themeVars.primaryColor,
    backgroundColor: 'white',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: themeVars.primaryColor,
  },
});

const ThemeInfo = () => {
  return <div>Current primary color: #BF4F74</div>;
};

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Themed Button</button>
    <ThemeInfo />
  </div>
);