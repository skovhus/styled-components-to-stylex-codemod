import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

type JsonTextareaProps = { hasError?: boolean } & Omit<
  React.ComponentProps<"textarea">,
  "className" | "style" | "sx"
>;

function JsonTextarea(props: JsonTextareaProps) {
  const { children, hasError, ...rest } = props;
  return (
    <textarea {...rest} sx={[styles.jsonTextarea, hasError && styles.jsonTextareaHasError]}>
      {children}
    </textarea>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <JsonTextarea defaultValue="default" />
    <JsonTextarea hasError defaultValue="error" />
  </div>
);

const styles = stylex.create({
  jsonTextarea: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: {
      default: $colors.bgBorderFaint,
      ":focus": $colors.controlPrimary,
    },
    borderRadius: 6,
    outline: {
      default: null,
      ":focus": "none",
    },
  },
  jsonTextareaHasError: {
    borderColor: {
      default: $colors.greenBase,
      ":focus": $colors.greenBase,
    },
  },
});
