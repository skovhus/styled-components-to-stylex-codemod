// Custom components that do not accept sx must receive className/style rather than an sx prop.
import * as React from "react";
import styled from "styled-components";

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

const InlineField = styled(PlainField)`
  display: inline-grid;
  gap: 4px;
  padding: 8px;
  background-color: #ecfccb;
`;

export const App = () => (
  <div style={{ padding: 12 }}>
    <InlineField label="Name" value="Ada" />
  </div>
);
