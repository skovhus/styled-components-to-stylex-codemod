import * as stylex from '@stylexjs/stylex';
import { themeVars } from './tokens.stylex';

const styles = stylex.create({
  button: {
    fontSize: '1em',
    margin: '1em',
    padding: '0.25em 1em',
    borderRadius: '3px',
    color: themeVars.main,
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: themeVars.main,
  },
});

const greenTheme = stylex.createTheme(themeVars, {
  main: 'mediumseagreen',
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Normal</button>
    <span {...stylex.props(greenTheme)}>
      <button {...stylex.props(styles.button)}>Themed</button>
    </span>
  </div>
);