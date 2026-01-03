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
  const { className, children, style, ...rest } = props;

  for (const k of Object.keys(rest)) {
    if (k.startsWith("$")) delete rest[k];
  }

  const sx = stylex.props(
    styles.dynamicBox,
    props["$background"] && styles.dynamicBoxBackgroundColor(props["$background"]),
    props["$size"] && styles.dynamicBoxHeight(props["$size"]),
    props["$size"] && styles.dynamicBoxWidth(props["$size"]),
  );

  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <div {...stylex.props(styles.staticBox)} />
    <DynamicBox $background="mediumseagreen" $size="100px" />
  </div>
);
