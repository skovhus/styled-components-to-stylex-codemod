// Custom components that do not accept sx must receive className/style rather than an sx prop.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

function InlineField(
  props: Omit<React.ComponentPropsWithRef<typeof PlainField>, "className" | "style">,
) {
  return <PlainField {...props} {...stylex.props(styles.inlineField)} />;
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
