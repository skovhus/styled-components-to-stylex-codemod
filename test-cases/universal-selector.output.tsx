import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  resetBox: {},
  resetBoxChild: {
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
  },
  container: {
    display: "flex",
    gap: "16px",
  },
  containerChild: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    listStyle: "none",
    padding: 0,
  },
  listItem: {},
  listItemNotLast: {
    marginBottom: "8px",
  },
  listItemFirst: {
    fontWeight: "bold",
  },
  hoverContainer: {},
  hoverContainerChildOnHover: {
    color: "#BF4F74",
  },
  deepReset: {},
  deepResetChild: {
    fontFamily: "inherit",
  },
  deepResetGrandchild: {
    fontSize: "inherit",
  },
});

function ResetBox({ children }: { children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.resetBox)}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              ...stylex.props(styles.resetBoxChild),
            } as React.HTMLAttributes<HTMLElement>)
          : child,
      )}
    </div>
  );
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div {...stylex.props(styles.container)}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              ...stylex.props(styles.containerChild),
            } as React.HTMLAttributes<HTMLElement>)
          : child,
      )}
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  const childArray = React.Children.toArray(children);
  return (
    <ul {...stylex.props(styles.list)}>
      {childArray.map((child, index) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              ...stylex.props(
                styles.listItem,
                index === 0 && styles.listItemFirst,
                index < childArray.length - 1 && styles.listItemNotLast,
              ),
            } as React.HTMLAttributes<HTMLElement>)
          : child,
      )}
    </ul>
  );
}

function HoverContainer({ children }: { children: React.ReactNode }) {
  const [isHovered, setIsHovered] = React.useState(false);
  return (
    <div
      {...stylex.props(styles.hoverContainer)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, {
              ...stylex.props(isHovered && styles.hoverContainerChildOnHover),
            } as React.HTMLAttributes<HTMLElement>)
          : child,
      )}
    </div>
  );
}

export const App = () => (
  <div>
    <ResetBox>
      <p>Paragraph</p>
      <span>Span</span>
    </ResetBox>
    <Container>
      <div>Item 1</div>
      <div>Item 2</div>
      <div>Item 3</div>
    </Container>
    <List>
      <li>First (bold)</li>
      <li>Second</li>
      <li>Third</li>
    </List>
    <HoverContainer>
      <span>Hover parent to change color</span>
    </HoverContainer>
    <div {...stylex.props(styles.deepReset)}>
      <div {...stylex.props(styles.deepResetChild)}>
        <span {...stylex.props(styles.deepResetGrandchild)}>Deep nested</span>
      </div>
    </div>
  </div>
);
