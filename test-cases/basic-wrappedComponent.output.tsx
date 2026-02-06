import * as React from "react";
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

function StyledLink(props: Omit<React.ComponentPropsWithRef<typeof Link>, "className" | "style">) {
  return <Link {...props} {...stylex.props(styles.link)} />;
}

export const App = () => <StyledLink href="https://example.com">Visit Example</StyledLink>;

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
