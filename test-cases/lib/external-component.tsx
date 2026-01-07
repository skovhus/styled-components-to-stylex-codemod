import * as React from "react";

export function ExternalComponent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, children, ...rest } = props;
  return (
    <div className={className} {...rest}>
      {children ?? "ExternalComponent"}
    </div>
  );
}
