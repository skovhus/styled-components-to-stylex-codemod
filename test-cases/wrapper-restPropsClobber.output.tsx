// styled.X used inside a wrapper that spreads external className/style via {...rest}.
// The codemod must use mergedSx (not stylex.props after rest) to avoid clobbering.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function OptionsList(props: { sx?: stylex.StyleXStyles } & React.ComponentProps<"ul">) {
  const { className, style, sx, ...rest } = props;
  return <ul {...rest} {...mergedSx([styles.optionsList, sx], className, style)} />;
}

function AliasedOptionsList(props: React.ComponentProps<"ul"> & { sx?: stylex.StyleXStyles }) {
  const { className, style, sx, ...rest } = props;
  return <ul {...rest} {...mergedSx([styles.aliasedOptionsList, sx], className, style)} />;
}

function TransitiveOptionsList(props: React.ComponentProps<"ul"> & { sx?: stylex.StyleXStyles }) {
  const { className, style, sx, ...rest } = props;
  return <ul {...rest} {...mergedSx([styles.transitiveOptionsList, sx], className, style)} />;
}

type ListWrapperProps = React.HTMLAttributes<HTMLUListElement> & {
  ref: React.Ref<HTMLUListElement>;
};

function ListWrapper(props: ListWrapperProps) {
  const { ref, ...rest } = props;
  return <OptionsList ref={ref} {...rest} />;
}

function AliasedListWrapper(props: ListWrapperProps) {
  const { ref, ...rest } = props;
  const ListComponent = true ? AliasedOptionsList : "ul";
  return <ListComponent ref={ref} {...rest} />;
}

function TransitiveListWrapper(props: ListWrapperProps) {
  const { ref, ...rest } = props;
  const FirstAlias = TransitiveOptionsList;
  const ListComponent = FirstAlias;
  return <ListComponent ref={ref} {...rest} />;
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
      <AliasedListWrapper ref={innerRef} {...innerProps}>
        {props.children}
      </AliasedListWrapper>
      <TransitiveListWrapper ref={innerRef} {...innerProps}>
        {props.children}
      </TransitiveListWrapper>
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

const styles = stylex.create({
  optionsList: {
    position: "relative",
    margin: 0,
    backgroundColor: "#f5f5f5",
    height: "100%",
    outline: "none",
  },
  aliasedOptionsList: {
    position: "relative",
    margin: 0,
    backgroundColor: "#eef8ff",
    height: "100%",
    outline: "none",
  },
  transitiveOptionsList: {
    position: "relative",
    margin: 0,
    backgroundColor: "#f2ffee",
    height: "100%",
    outline: "none",
  },
});
