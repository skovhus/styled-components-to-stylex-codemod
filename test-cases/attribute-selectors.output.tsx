import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  input: {
    padding: "8px 12px",
    borderWidth: "2px",
    borderStyle: {
      default: "solid",
      ":read-only": "dashed",
    },
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
    backgroundColor: {
      default: null,
      ":disabled": "#f5f5f5",
      ":read-only": "#fafafa",
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
  inputTypeCheckbox: {
    width: "20px",
    height: "20px",
    padding: 0,
  },
  inputTypeRadio: {
    width: "20px",
    height: "20px",
    padding: 0,
    borderRadius: "50%",
  },
  link: {
    color: "#BF4F74",
    textDecoration: "none",
  },
  linkTargetBlank: {
    "::after": {
      content: '" ↗"',
      fontSize: "0.8em",
    },
  },
  linkHrefStartsWithHttps: {
    color: "#4CAF50",
  },
  linkHrefEndsWithPdf: {
    color: "#F44336",
  },
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function Input(props: InputProps) {
  const { type, className, ...rest } = props;
  const sx = stylex.props(
    styles.input,
    type === "checkbox" && styles.inputTypeCheckbox,
    type === "radio" && styles.inputTypeRadio,
  );
  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      type={type}
      {...rest}
    />
  );
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode;
}

function Link({ target, href, className, children, ...rest }: LinkProps) {
  const sx = stylex.props(
    styles.link,
    target === "_blank" && styles.linkTargetBlank,
    href?.startsWith("https") && styles.linkHrefStartsWithHttps,
    href?.endsWith(".pdf") && styles.linkHrefEndsWithPdf,
  );
  return (
    <a
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      target={target}
      href={href}
      {...rest}
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
