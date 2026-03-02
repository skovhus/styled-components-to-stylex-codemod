// styled.X used inside a wrapper that spreads external className/style via {...rest}.
// The codemod must use mergedSx (not stylex.props after rest) to avoid clobbering.
import * as React from "react";
import styled from "styled-components";

const OptionsList = styled.ul`
  position: relative;
  margin: 0;
  background-color: #f5f5f5;
  height: 100%;
  outline: none;
`;

type ListWrapperProps = React.HTMLAttributes<HTMLUListElement> & {
  ref: React.Ref<HTMLUListElement>;
};

function ListWrapper(props: ListWrapperProps) {
  const { ref, ...rest } = props;
  return <OptionsList ref={ref} {...rest} />;
}

function VirtualList(props: { children: React.ReactNode }) {
  const innerRef = React.useRef<HTMLUListElement>(null);

  const innerProps = {
    className: "virtual-list-inner",
    style: {
      height: 400,
      width: "100%",
      position: "relative" as const,
      overflow: "visible" as const,
    },
  };

  return (
    <div style={{ height: 200, overflow: "auto", border: "2px solid #333" }}>
      <ListWrapper ref={innerRef} {...innerProps}>
        {props.children}
      </ListWrapper>
    </div>
  );
}

export const App = () => (
  <div style={{ padding: 16 }}>
    <VirtualList>
      {Array.from({ length: 20 }, (_, i) => (
        <li key={i} style={{ padding: "8px 12px", borderBottom: "1px solid #ddd" }}>
          Item {i + 1}
        </li>
      ))}
    </VirtualList>
  </div>
);
