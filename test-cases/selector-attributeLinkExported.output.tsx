import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type LinkProps = React.PropsWithChildren<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "style">
>;

export function Link(props: LinkProps) {
  const { href, target, children, ...rest } = props;
  const isHttps = href?.startsWith("https");
  const isPdf = href?.endsWith(".pdf");
  const isExternal = target === "_blank";

  const sx = stylex.props(
    styles.link,
    isExternal && styles.linkExternal,
    isHttps && styles.linkHttps,
    isPdf && styles.linkPdf,
  );

  return (
    <a href={href} target={target} {...rest} {...sx}>
      {children}
    </a>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <Link href="/page">Internal</Link>
      <Link href="https://example.com" target="_blank">
        External HTTPS
      </Link>
      <Link href="/doc.pdf">PDF Link</Link>
    </div>
  );
}

const styles = stylex.create({
  link: {
    color: "#bf4f74",
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
  },
  linkExternal: {
    "::after": {
      content: '" ↗"',
      fontSize: "0.8em",
    },
  },
  linkHttps: {
    color: "#4caf50",
  },
  linkPdf: {
    color: "#f44336",
  },
});
