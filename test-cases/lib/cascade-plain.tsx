import * as React from "react";

export function Plain(props: { className?: string; children?: React.ReactNode }) {
  return <div className={props.className}>{props.children}</div>;
}
