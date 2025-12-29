import React from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  link: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 10px',
    backgroundColor: 'papayawhip',
    color: '#BF4F74',
  },
  icon: {
    flex: 'none',
    width: '48px',
    height: '48px',
    fill: '#BF4F74',
    transition: 'fill 0.25s',
  },
  iconHover: {
    fill: 'rebeccapurple',
  },
});

export const App = () => (
  <a href="#" {...stylex.props(styles.link)}>
    <Icon viewBox="0 0 20 20" styles={styles}>
      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
    </Icon>
    Hover me
  </a>
);

function Icon({ viewBox, children, styles }: { viewBox: string; children: React.ReactNode; styles: typeof styles }) {
  return (
    <svg viewBox={viewBox} {...stylex.props(styles.icon)}>
      {children}
    </svg>
  );
}