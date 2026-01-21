import * as React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  isOpen: boolean;
};

export function ExternalComponent(props: Props) {
  const { className, children, isOpen, ...rest } = props;
  return (
    <div className={className} {...rest}>
      {children ?? "ExternalComponent"}
    </div>
  );
}
