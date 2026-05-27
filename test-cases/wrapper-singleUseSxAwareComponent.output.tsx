// Single-use styled(Component) with an sx-aware base should inline into the JSX call site.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import { DynamicFlex } from "./lib/sx-dynamic-flex";
import { Text } from "./lib/sx-aware-text";

function CompoundFlex(props: React.ComponentPropsWithRef<"div"> & { sx?: stylex.StyleXStyles }) {
  const { sx, children, ...rest } = props;
  return (
    <div {...rest} sx={sx}>
      {children}
    </div>
  );
}

CompoundFlex.Item = (props: { children?: React.ReactNode }) => <span>{props.children}</span>;

function NamespacedContainer(
  props: Omit<React.ComponentPropsWithRef<typeof CompoundFlex>, "className" | "style">,
) {
  const { sx, ...rest } = props;
  return <CompoundFlex {...rest} sx={[styles.namespacedContainer, sx]} />;
}

NamespacedContainer.Item = (CompoundFlex as any).Item;

export const App = (props: { className?: string; sx?: stylex.StyleXStyles }) => (
  <div style={{ display: "grid", gridTemplateAreas: '"br"', padding: 16, gap: 12 }}>
    <DynamicFlex
      justify="center"
      align="center"
      gap={16}
      sx={[styles.tombstoneContainer, helpers.flexCenter]}
    >
      Tombstone flex
    </DynamicFlex>
    <Text size="md" color="labelTitle" as="p" align="center" sx={styles.titleText}>
      Link
    </Text>
    <DynamicFlex sx={[styles.basicContainer, props.sx]} className={props.className}>
      Basic container
    </DynamicFlex>
    <NamespacedContainer.Item>Namespace item</NamespacedContainer.Item>
  </div>
);

const styles = stylex.create({
  tombstoneContainer: {
    gridArea: "br",
    backgroundColor: "#e0f2fe",
    borderRadius: 4,
    padding: 16,
  },
  titleText: {
    marginBottom: 12,
  },
  basicContainer: {
    paddingBlock: 3,
    paddingInline: 6,
    gap: 8,
    alignItems: "center",
  },
  namespacedContainer: {
    padding: 4,
    backgroundColor: "#fef3c7",
  },
});
