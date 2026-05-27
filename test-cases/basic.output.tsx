import React from "react";
import * as stylex from "@stylexjs/stylex";

export function Select(props: Omit<React.ComponentProps<"select">, "className" | "style" | "sx">) {
  return <select {...props} sx={styles.select} />;
}

function Link(props: { to: string; children: React.ReactNode }) {
  return <a href={props.to}>{props.children}</a>;
}

function Counter(props: { children: React.ReactNode }) {
  return <span data-count={React.Children.count(props.children)}>{props.children}</span>;
}

export function Repro(props: { integrationsPath: string }) {
  return (
    <>
      Browse <Link to={props.integrationsPath}>integrations</Link> to enable new agents, or manage
      access
      <span sx={styles.span}>team</span>
    </>
  );
}

export function ChildrenShapeRepro() {
  return (
    <Counter>
      Before <span sx={styles.countingSpan} />
      after
    </Counter>
  );
}

export const App = () => (
  <section sx={styles.wrapper}>
    <h1 sx={styles.title}>Hello World!</h1>
    <Repro integrationsPath="/integrations" />
    <ChildrenShapeRepro />
    <Select onChange={(e) => console.log(e.target.value)} />
  </section>
);

const styles = stylex.create({
  title: {
    fontSize: "1.5em",
    textAlign: "center",
    color: "#bf4f74",
  },
  // Page wrapper with padding
  wrapper: {
    padding: "4em",
    backgroundColor: "papayawhip",
  },
  select: {
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 4,
    fontSize: 13,
  },
  span: {
    position: "relative",
  },
  countingSpan: {
    color: "rebeccapurple",
  },
});
