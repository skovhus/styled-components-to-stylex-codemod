import { describe, expect, it } from "vitest";
import { expandStyleObjectShorthands } from "./style-object-normalization.js";

describe("expandStyleObjectShorthands", () => {
  it("propagates comments from borderRadius to emitted corner longhands", () => {
    const todo =
      "TODO: Verify this flat borderRadius override is safe; add explicit conditional defaults if Button's root sx sets borderRadius states before caller sx.";
    const styleObj = {
      borderRadius: "4px 8px",
      borderTopLeftRadius: "6px",
      __propComments: {
        borderRadius: { leadingLine: todo },
        borderTopLeftRadius: { leadingLine: "preserve existing corner note" },
      },
    };

    expect(expandStyleObjectShorthands(styleObj)).toMatchObject({
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "8px",
      borderBottomRightRadius: "4px",
      borderBottomLeftRadius: "8px",
      __propComments: {
        borderTopLeftRadius: {
          leadingLine: `preserve existing corner note\n${todo}`,
        },
        borderTopRightRadius: { leadingLine: todo },
        borderBottomRightRadius: { leadingLine: todo },
        borderBottomLeftRadius: { leadingLine: todo },
      },
    });
  });
});
