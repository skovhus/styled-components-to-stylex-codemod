import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  comp: {
    color: "red",
    cursor: "pointer",
  },
  compDraggable: {
    cursor: "move",
  },
  styledLink: {
    color: "blue",
  },
  styledLinkRed: {
    color: "red",
  },
});

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>
    {text}
  </a>
);

export const App = () => (
  <div>
    <div {...stylex.props(styles.comp, styles.compDraggable)}>Draggable</div>
    <div {...stylex.props(styles.comp)}>Not Draggable</div>
    <Link text="Click" {...stylex.props(styles.styledLink, styles.styledLinkRed)} />
    <Link text="Click" {...stylex.props(styles.styledLink)} />
  </div>
);
