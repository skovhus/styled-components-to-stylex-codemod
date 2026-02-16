import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  $userSelected?: boolean;
}>;

// Pattern 1: Logical AND with template literal containing multiple CSS declarations
function Box(props: BoxProps) {
  const { children, $userSelected } = props;

  return (
    <div {...stylex.props(styles.box, $userSelected ? styles.boxUserSelected : undefined)}>
      {children}
    </div>
  );
}

type CardProps = React.PropsWithChildren<{
  $highlighted?: boolean;
}>;

// Pattern 2: Logical AND with string literal containing multiple CSS declarations
function Card(props: CardProps) {
  const { children, $highlighted } = props;

  return (
    <div {...stylex.props(styles.card, $highlighted ? styles.cardHighlighted : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box>Default Box</Box>
    <Box $userSelected>Selected Box</Box>
    <Card>Default Card</Card>
    <Card $highlighted>Highlighted Card</Card>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "16px",
  },
  boxUserSelected: {
    backgroundColor: "blue",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "blue",
  },
  card: {
    padding: "8px",
  },
  cardHighlighted: {
    backgroundColor: "yellow",
    color: "black",
    fontWeight: "bold",
  },
});
