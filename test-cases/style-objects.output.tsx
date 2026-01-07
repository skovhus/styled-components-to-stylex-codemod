import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  staticBox: {
    backgroundColor: "#BF4F74",
    height: "50px",
    width: "50px",
    borderRadius: "4px",
  },
  dynamicBox: {
    backgroundColor: "#BF4F74",
    height: "50px",
    width: "50px",
    borderRadius: "4px",
  },
  dynamicBoxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  dynamicBoxHeight: (height: string) => ({
    height,
  }),
  dynamicBoxWidth: (width: string) => ({
    width,
  }),
});

function DynamicBox(props) {
  const { $background, $size } = props;

  return (
    <div
      {...stylex.props(
        styles.dynamicBox,
        $background && styles.dynamicBoxBackgroundColor($background),
        $size && styles.dynamicBoxHeight($size),
        $size && styles.dynamicBoxWidth($size),
      )}
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <div>
    <div {...stylex.props(styles.staticBox)} />
    <DynamicBox $background="mediumseagreen" $size="100px" style={{ border: "1px solid red" }} />
  </div>
);
