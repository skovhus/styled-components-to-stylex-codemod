import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

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

function StyledLink(props: Omit<React.ComponentPropsWithRef<typeof Link>, "style">) {
  const { className, children, ...rest } = props;

  return (
    <Link {...rest} {...mergedSx(styles.link, className)}>
      {children}
    </Link>
  );
}

export const App = () => <StyledLink href="https://example.com">Visit Example</StyledLink>;

const styles = stylex.create({
  link: {
    color: "#bf4f74",
    fontWeight: "bold",
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
  },
});
