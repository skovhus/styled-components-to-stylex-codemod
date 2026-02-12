import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "style">;
function Input(props: InputProps) {
  const { type, ...rest } = props;
  const sx = stylex.props(
    styles.input,
    type === "checkbox" && styles.inputCheckbox,
    type === "radio" && styles.inputRadio,
  );
  return <input type={type} {...rest} {...sx} />;
}
type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "style">;
function Link(props: LinkProps) {
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

export const App = () => (
  <div>
    <Input type="text" placeholder="Enter text..." />
    <Input type="text" disabled placeholder="Disabled" />
    <Input type="checkbox" />
    <Input type="radio" name="option" />
    <Input type="text" readOnly value="Read only" />
    <br />
    <Link href="/page">Internal Link</Link>
    <Link href="https://example.com" target="_blank">
      External HTTPS Link
    </Link>
    <Link href="/document.pdf">PDF Link</Link>
  </div>
);

const styles = stylex.create({
  input: {
    paddingBlock: "8px",
    paddingInline: "12px",
    borderWidth: "2px",
    borderStyle: {
      default: "solid",
      ":read-only": "dashed",
    },
    borderColor: {
      default: "#ccc",
      ":focus": "#bf4f74",
    },
    borderRadius: "4px",
    fontSize: "14px",
    outline: {
      default: null,
      ":focus": "none",
    },
    backgroundColor: {
      default: null,
      ":disabled": "#f5f5f5",
      ":read-only": "#fafafa",
    },
    backgroundImage: {
      default: null,
      ":disabled": "none",
      ":read-only": "none",
    },
    color: {
      default: null,
      ":disabled": "#999",
    },
    cursor: {
      default: null,
      ":disabled": "not-allowed",
    },
    "::placeholder": {
      color: "#999",
      fontStyle: "italic",
    },
  },
  inputCheckbox: {
    width: "20px",
    height: "20px",
    padding: 0,
  },
  inputRadio: {
    width: "20px",
    height: "20px",
    padding: 0,
    borderRadius: "50%",
  },
  link: {
    color: "#bf4f74",
    textDecoration: "none",
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
