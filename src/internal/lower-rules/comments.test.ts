import { describe, expect, it } from "vitest";
import { propagatePropComments } from "./comments.js";

describe("propagatePropComments", () => {
  it("copies shorthand comments to replacement longhands", () => {
    const styleObj = {
      marginTop: 4,
      marginRight: 4,
      marginBottom: 4,
      marginLeft: 4,
      __propComments: {
        margin: { leadingLine: "TODO: verify margin override" },
        marginTop: { leadingLine: "existing top note" },
      },
    };

    propagatePropComments(styleObj, "margin", [
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
    ]);

    expect(styleObj).toMatchObject({
      __propComments: {
        marginTop: { leadingLine: "existing top note\nTODO: verify margin override" },
        marginRight: { leadingLine: "TODO: verify margin override" },
        marginBottom: { leadingLine: "TODO: verify margin override" },
        marginLeft: { leadingLine: "TODO: verify margin override" },
      },
    });
  });
});
