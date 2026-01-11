import { defineAdapter } from "../adapter.ts";
import { fixtureAdapter } from "../fixture-adapter.ts";

// Test adapters - examples of custom adapter usage
export const customAdapter = defineAdapter({
  resolveValue(ctx) {
    if (ctx.kind !== "theme") {
      return null;
    }
    return {
      expr: `customVar('${ctx.path}', '')`,
      imports: [
        {
          from: { kind: "specifier", value: "./custom-theme" },
          names: [{ imported: "customVar" }],
        },
      ],
    };
  },
});

export { fixtureAdapter };
