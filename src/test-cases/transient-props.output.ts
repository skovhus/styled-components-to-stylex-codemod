import React from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  comp: {
    color: 'red',
  },
  compDraggable: {
    cursor: 'move',
  },
  compDefault: {
    cursor: 'pointer',
  },
});

const Comp = ({ $draggable, children }: { $draggable?: boolean; children: React.ReactNode }) => (
  <div {...stylex.props(styles.comp, $draggable ? styles.compDraggable : styles.compDefault)}>
    {children}
  </div>
);

const linkStyles = stylex.create({
  link: {
    color: 'blue',
  },
  linkRed: {
    color: 'red',
  },
});

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>{text}</a>
);

const StyledLink = ({ $red, ...props }: { $red?: boolean; text: string }) => (
  <Link {...props} {...stylex.props(linkStyles.link, $red && linkStyles.linkRed)} />
);

export const App = () => (
  <div>
    <Comp $draggable>Draggable</Comp>
    <Comp>Not Draggable</Comp>
    <StyledLink text="Click" $red />
    <StyledLink text="Click" />
  </div>
);