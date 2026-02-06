import React from "react";

// Mimics real Loading component that does NOT accept className.
// Only accepts style, size, and text props.
// This is important: styled(Loading) adds className support via the wrapper,
// but the underlying Loading component itself rejects className.
export type LoadingProps = {
  style?: React.CSSProperties;
  size?: "small" | "medium" | "large";
  text?: string | false;
};

export function Loading({ style, size = "medium", text = "Loading…" }: LoadingProps) {
  return (
    <div style={style}>
      <div className={`spinner spinner-${size}`}>{text}</div>
    </div>
  );
}
