import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type PlainFieldProps = {
  className?: string;
  label: string;
  style?: React.CSSProperties;
  value: string;
};

function PlainField(props: PlainFieldProps) {
  const { className, label, style, value } = props;
  return (
    <label className={className} style={style}>
      <span>{label}</span>
      <input readOnly value={value} />
    </label>
  );
}

function InlineField(props: PlainFieldProps) {
  const { className, style, ...rest } = props;
  return <PlainField {...rest} {...mergedSx(styles.inlineField, className, style)} />;
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <InlineField label="Name" value="Ada" />
  </div>
);

const styles = stylex.create({
  inlineField: {
    display: "inline-grid",
    gap: 4,
    padding: 8,
    backgroundColor: "#ecfccb",
  },
});
