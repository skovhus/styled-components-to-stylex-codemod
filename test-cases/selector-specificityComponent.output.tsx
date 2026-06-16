import * as React from "react";
import * as stylex from "@stylexjs/stylex";

function BaseAction(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} />;
}

type SpecificActionProps = { active?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof BaseAction>,
  "className" | "style"
>;

function SpecificAction(props: SpecificActionProps) {
  const { active, ...rest } = props;
  return (
    <BaseAction
      {...rest}
      {...stylex.props(
        styles.specificAction,
        active ? styles.specificActionActive : styles.specificActionNotActive,
      )}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <SpecificAction>Hover action</SpecificAction>
    <SpecificAction active>Active action</SpecificAction>
  </div>
);

const styles = stylex.create({
  specificAction: {
    color: "#1f2937",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#94a3b8",
    paddingBlock: 8,
    paddingInline: 12,
  },
  specificActionActive: {
    backgroundColor: "#dbeafe",
  },
  specificActionNotActive: {
    // TODO: Specificity hack stripped, carefully test (was: &&:hover)
    // TODO: Validate wrapped component applies consumer sx/stylex.props entries last so stripped specificity still wins.
    // TODO: Validate the default background color; StyleX requires an explicit default for conditional backgroundColor.
    backgroundColor: {
      default: null,
      ":hover": "#fee2e2",
    },
  },
});
