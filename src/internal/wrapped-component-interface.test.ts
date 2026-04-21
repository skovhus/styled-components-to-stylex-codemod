import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetWrappedComponentSxAwareCacheForTests,
  isWrappedComponentSxAware,
} from "./wrapped-component-interface.js";

describe("isWrappedComponentSxAware (auto-detection)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sx-aware-detection-"));
    __resetWrappedComponentSxAwareCacheForTests();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeLib(name: string, source: string): string {
    const filePath = join(dir, `${name}.tsx`);
    writeFileSync(filePath, source, "utf8");
    return filePath;
  }

  function check(componentLocalName: string, libPath: string): boolean {
    return isWrappedComponentSxAware({
      adapter: { useSxProp: true },
      importMap: new Map([
        [
          componentLocalName,
          {
            importedName: componentLocalName,
            source: { kind: "absolutePath", value: libPath.replace(/\.(tsx|ts|jsx|js)$/, "") },
          },
        ],
      ]),
      componentLocalName,
      filePath: join(dir, "consumer.tsx"),
    });
  }

  it("detects sx on a function component with an inline literal prop type", () => {
    const lib = writeLib(
      "btn",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function SxAwareButton(props: { sx?: stylex.StyleXStyles; className?: string }) {
  return <button className={props.className} />;
}
`,
    );
    expect(check("SxAwareButton", lib)).toBe(true);
  });

  it("detects sx through a type alias intersection (Text-style generic component)", () => {
    const lib = writeLib(
      "text",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TextProps = { size?: "sm" | "md" };

type TextComponentProps<C extends React.ElementType> = TextProps &
  Omit<React.ComponentPropsWithRef<C>, keyof TextProps> & { sx?: stylex.StyleXStyles; as?: C };

export function Text<C extends React.ElementType = "span">(props: TextComponentProps<C>) {
  return null as any;
}
`,
    );
    expect(check("Text", lib)).toBe(true);
  });

  it("detects sx on an interface-typed prop type", () => {
    const lib = writeLib(
      "card",
      `
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface CardProps {
  sx?: stylex.StyleXStyles;
  children?: React.ReactNode;
}

export const Card = (props: CardProps) => <div>{props.children}</div>;
`,
    );
    expect(check("Card", lib)).toBe(true);
  });

  it("returns false when the component does not declare sx", () => {
    const lib = writeLib(
      "plain",
      `
import * as React from "react";

export function PlainButton(props: { className?: string }) {
  return <button className={props.className} />;
}
`,
    );
    expect(check("PlainButton", lib)).toBe(false);
  });

  it("does not match `sx` appearing as an Omit utility argument", () => {
    const lib = writeLib(
      "no-sx-omit",
      `
import * as React from "react";

type ButtonVariant = "primary" | "secondary";

/** Props for the button components. Explicitly omits sx to forbid it. */
export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "sx"> & {
  /** Button style variant. */
  variant?: ButtonVariant;
};

export const Button = (props: ButtonProps) => null as any;
`,
    );
    expect(check("Button", lib)).toBe(false);
  });

  it("does not match `sx` appearing in a string literal value of another prop", () => {
    const lib = writeLib(
      "no-sx-string-value",
      `
export type WeirdProps = {
  /** Some unrelated prop whose default literal type happens to contain "sx". */
  variant?: "sx-like" | "other";
};

export const Weird = (props: WeirdProps) => null as any;
`,
    );
    expect(check("Weird", lib)).toBe(false);
  });

  it("returns false for package-style imports (no source to scan)", () => {
    expect(
      isWrappedComponentSxAware({
        adapter: { useSxProp: true },
        importMap: new Map([
          [
            "ExternalButton",
            {
              importedName: "ExternalButton",
              source: { kind: "specifier", value: "@company/ui" },
            },
          ],
        ]),
        componentLocalName: "ExternalButton",
        filePath: "/anywhere/consumer.tsx",
      }),
    ).toBe(false);
  });

  it("adapter override wins over auto-detection (true override)", () => {
    const lib = writeLib(
      "plain2",
      `
export function PlainButton(props: { className?: string }) {
  return null as any;
}
`,
    );
    const result = isWrappedComponentSxAware({
      adapter: {
        useSxProp: true,
        wrappedComponentInterface: () => ({ acceptsSx: true }),
      },
      importMap: new Map([
        [
          "PlainButton",
          {
            importedName: "PlainButton",
            source: { kind: "absolutePath", value: lib.replace(/\.tsx$/, "") },
          },
        ],
      ]),
      componentLocalName: "PlainButton",
      filePath: join(dir, "consumer.tsx"),
    });
    expect(result).toBe(true);
  });

  it("adapter override wins over auto-detection (false override)", () => {
    const lib = writeLib(
      "btn2",
      `
import * as stylex from "@stylexjs/stylex";
export function SxAwareButton(props: { sx?: stylex.StyleXStyles }) {
  return null as any;
}
`,
    );
    const result = isWrappedComponentSxAware({
      adapter: {
        useSxProp: true,
        wrappedComponentInterface: () => ({ acceptsSx: false }),
      },
      importMap: new Map([
        [
          "SxAwareButton",
          {
            importedName: "SxAwareButton",
            source: { kind: "absolutePath", value: lib.replace(/\.tsx$/, "") },
          },
        ],
      ]),
      componentLocalName: "SxAwareButton",
      filePath: join(dir, "consumer.tsx"),
    });
    expect(result).toBe(false);
  });

  it("adapter returning undefined falls through to auto-detection", () => {
    const lib = writeLib(
      "btn3",
      `
import * as stylex from "@stylexjs/stylex";
export function SxAwareButton(props: { sx?: stylex.StyleXStyles }) {
  return null as any;
}
`,
    );
    const result = isWrappedComponentSxAware({
      adapter: {
        useSxProp: true,
        wrappedComponentInterface: () => undefined,
      },
      importMap: new Map([
        [
          "SxAwareButton",
          {
            importedName: "SxAwareButton",
            source: { kind: "absolutePath", value: lib.replace(/\.tsx$/, "") },
          },
        ],
      ]),
      componentLocalName: "SxAwareButton",
      filePath: join(dir, "consumer.tsx"),
    });
    expect(result).toBe(true);
  });
});
