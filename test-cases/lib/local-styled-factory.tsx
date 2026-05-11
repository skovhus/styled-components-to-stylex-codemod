import * as React from "react";

const styled = {
  div: (_strings: TemplateStringsArray) => "div",
};

const LocalStyledThing = styled.div`
  color: hotpink;
`;

export function LocalStyledFactoryComponent(props: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={props.className} data-local-styled={LocalStyledThing}>
      {props.children}
    </div>
  );
}
