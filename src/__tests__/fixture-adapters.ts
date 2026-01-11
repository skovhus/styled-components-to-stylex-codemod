import { defineAdapter } from "../adapter.ts";
import { fixtureAdapterConfig } from "./fixture-adapter-config.ts";

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

// Fixtures don't use theme resolution, but the transformer requires an adapter.
export const fixtureAdapter = defineAdapter(fixtureAdapterConfig);
