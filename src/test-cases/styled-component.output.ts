import React from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  link: {
    color: '#BF4F74',
    fontWeight: 'bold',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
  },
});

const Link = ({ className, children, href }: { className?: string; children: React.ReactNode; href: string }) => (
  <a className={className} href={href}>
    {children}
  </a>
);

export const App = () => (
  <Link href="https://example.com" {...stylex.props(styles.link)}>Visit Example</Link>
);