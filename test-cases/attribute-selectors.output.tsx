import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  input: {
    padding: "8px 12px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":focus": "#BF4F74",
    },
    borderRadius: "4px",
    fontSize: "14px",
    outline: {
      default: null,
      ":focus": "none",
    },
  },
  inputDisabled: {
    backgroundColor: "#f5f5f5",
    color: "#999",
    cursor: "not-allowed",
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
  inputReadonly: {
    backgroundColor: "#fafafa",
    borderStyle: "dashed",
  },
  inputPlaceholder: {
    "::placeholder": {
      color: "#999",
      fontStyle: "italic",
    },
  },
  link: {
    color: "#BF4F74",
    textDecoration: "none",
  },
  linkExternal: {
    "::after": {
      content: '" ↗"',
      fontSize: "0.8em",
    },
  },
  linkHttps: {
    color: "#4CAF50",
  },
  linkPdf: {
    color: "#F44336",
  },
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function Input(props: InputProps) {
  const { type, disabled, readOnly, className, ...rest } = props;
  const sx = stylex.props(
    styles.input,
    styles.inputPlaceholder,
    disabled && styles.inputDisabled,
    readOnly && styles.inputReadonly,
    type === "checkbox" && styles.inputCheckbox,
    type === "radio" && styles.inputRadio,
  );
  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      type={type}
      disabled={disabled}
      readOnly={readOnly}
      {...rest}
    />
  );
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode;
}

function Link({ href, target, className, children, ...props }: LinkProps) {
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
    <a
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      href={href}
      target={target}
      {...props}
    >
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
