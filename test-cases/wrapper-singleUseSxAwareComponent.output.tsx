import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import { DynamicFlex } from "./lib/sx-dynamic-flex";
import { Text } from "./lib/sx-aware-text";

export const App = () => (
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
});
