import * as stylex from "@stylexjs/stylex";

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>
    {text}
  </a>
);

export const App = () => (
  <div>
    <div {...stylex.props(styles.comp, styles.compDraggable)}>Draggable</div>
    <div {...stylex.props(styles.comp)}>Not Draggable</div>
    <Link {...stylex.props(styles.link, styles.linkRed)} text="Click" />
    <Link {...stylex.props(styles.link)} text="Click" />
  </div>
);

const styles = stylex.create({
  comp: {
    color: "red",
    cursor: "pointer",
  },
  compDraggable: {
    cursor: "move",
  },
  link: {
    color: "blue",
  },
  linkRed: {
    color: "red",
  },
});
