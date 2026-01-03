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
    "::placeholder": {
      color: "#999",
      fontStyle: "italic",
    },
  },
  inputDisabled: {
    backgroundColor: "#f5f5f5",
    color: "#999",
    cursor: "not-allowed",
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
  inputReadonly: {
    backgroundColor: "#fafafa",
    borderStyle: "dashed",
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
  linkHrefHttps: {
    color: "#4CAF50",
  },
  linkHrefPdf: {
    color: "#F44336",
  },
});

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function Input(props: InputProps) {
  const { disabled, type, readonly, className, ...rest } = props;
  const sx = stylex.props(
    styles.input,
    disabled && styles.inputDisabled,
    type === "checkbox" && styles.inputTypeCheckbox,
    type === "radio" && styles.inputTypeRadio,
    readonly && styles.inputReadonly,
  );
  return (
    <input
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      disabled={disabled}
      type={type}
      readonly={readonly}
      {...rest}
    />
  );
}
interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode;
}

function Link({ target, href, className, ...rest }: LinkProps) {
  const sx = stylex.props(
    styles.link,
    target === "_blank" && styles.linkTargetBlank,
    href?.startsWith("https") && styles.linkHrefHttps,
    href?.endsWith(".pdf") && styles.linkHrefPdf,
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
