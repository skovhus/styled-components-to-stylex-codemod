import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box}>Background reset</div>;

const styles = stylex.create({
  box: {
    backgroundColor: "transparent",
    backgroundImage: 'url("/asset.svg")',
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "scroll",
    backgroundPosition: "center",
    backgroundSize: "auto",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    width: 80,
    height: 40,
  },
});
