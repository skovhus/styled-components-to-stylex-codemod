import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <>
    <button {...stylex.props(styles.buttonColor("red"))}>Click</button>
    <a href="#" {...stylex.props(styles.linkFontSize("14px"))}>
      Link
    </a>
    <div {...stylex.props()}>Card</div>
    <div {...stylex.props(styles.cardPadding("24px"))}>Card with padding</div>
    <div {...stylex.props()}>Box</div>
    <div {...stylex.props(styles.boxMargin("12px"))}>Box with margin</div>
    <span {...stylex.props(styles.textFontWeight("bold"), styles.textFontSize("16px"))}>Text</span>
  </>
);

const styles = stylex.create({
  buttonColor: (color: string) => ({
    color,
  }),
  linkFontSize: (fontSize: string) => ({
    fontSize,
  }),
  cardPadding: (padding: string) => ({
    padding,
  }),
  boxMargin: (margin: string) => ({
    margin,
  }),
  textFontWeight: (fontWeight: string) => ({
    fontWeight,
  }),
  textFontSize: (fontSize: string) => ({
    fontSize,
  }),
});
