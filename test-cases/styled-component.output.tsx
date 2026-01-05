import React from "react";
import * as stylex from "@stylexjs/stylex";

const Link = ({
  className,
  children,
  href,
}: {
  className?: string;
  children: React.ReactNode;
  href: string;
}) => (
  <a className={className} href={href}>
    {children}
  </a>
);

const styles = stylex.create({
  link: {
    color: "#BF4F74",
    fontWeight: "bold",
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
  },
});

export const App = () => (
  <Link href="https://example.com" {...stylex.props(styles.link)}>
    Visit Example
  </Link>
);
