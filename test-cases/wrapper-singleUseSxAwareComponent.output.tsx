import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import { DynamicFlex } from "./lib/sx-dynamic-flex";

export const App = () => (
  <div style={{ display: "grid", gridTemplateAreas: '"br"', padding: 16 }}>
    <DynamicFlex
      justify="center"
      align="center"
      gap={16}
      sx={[styles.tombstoneContainer, helpers.flexCenter]}
    >
      Tombstone flex
    </DynamicFlex>
  </div>
);

const styles = stylex.create({
  tombstoneContainer: {
    gridArea: "br",
    backgroundColor: "#e0f2fe",
    borderRadius: 4,
    padding: 16,
  },
});
