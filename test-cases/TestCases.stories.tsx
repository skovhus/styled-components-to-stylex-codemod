import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { ThemeProvider } from "styled-components";
import { testCaseTheme } from "./tokens.stylex";

type MeasuredBox = { x: number; y: number; w: number; h: number };

const RenderDebugFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<MeasuredBox | null>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const el = host.querySelector(":scope > *") as HTMLElement | null;
    if (!el) {
      setBox(null);
      return;
    }

    const update = () => {
      const hostRect = host.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setBox({
        x: Math.round(elRect.left - hostRect.left),
        y: Math.round(elRect.top - hostRect.top),
        w: Math.round(elRect.width),
        h: Math.round(elRect.height),
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "24px",
        background:
          "repeating-linear-gradient(45deg, rgba(0,0,0,0.04), rgba(0,0,0,0.04) 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px)",
        borderRadius: "6px",
        padding: "6px",
      }}
    >
      <div ref={hostRef}>{children}</div>
      <div
        style={{
          position: "absolute",
          top: "6px",
          right: "6px",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: "11px",
          color: "#666",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: "4px",
          padding: "2px 6px",
        }}
      >
        {box ? `${box.w}×${box.h}` : "no element"}
      </div>
      {box ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 6 + box.x,
            top: 6 + box.y,
            width: Math.max(1, box.w),
            height: Math.max(2, box.h),
            outline: "2px dashed rgba(255, 99, 71, 0.9)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
};

// Auto-discover all test case modules using Vite's glob import
// Supports .tsx, .jsx, and .flow.jsx extensions
// Excludes `_unsupported.*` and `unsupported-*` files to avoid import errors
const inputModules = import.meta.glob<{ App: React.ComponentType }>(
  [
    "./*.input.tsx",
    "./*.input.jsx",
    "./*.flow.input.jsx",
    "!./_unsupported.*.tsx",
    "!./unsupported-*.tsx",
  ],
  { eager: true },
);
const outputModules = import.meta.glob<{ App: React.ComponentType }>(
  [
    "./*.output.tsx",
    "./*.output.jsx",
    "./*.flow.output.jsx",
    "!./_unsupported.*.tsx",
    "!./unsupported-*.tsx",
  ],
  { eager: true },
);

// Extract test case names from file paths
function getTestCaseName(path: string): string {
  // Handle: .input.tsx, .output.tsx, .input.jsx, .output.jsx, .flow.input.jsx, .flow.output.jsx
  const match = path.match(/\.\/(.+?)(?:\.flow)?\.(input|output)\.(?:tsx|jsx)$/);
  return match?.[1] ?? path;
}

// Get unique test case names
const testCaseNames = [
  ...new Set([
    ...Object.keys(inputModules).map(getTestCaseName),
    ...Object.keys(outputModules).map(getTestCaseName),
  ]),
]
  // Exclude `_unsupported.*` fixtures from Storybook comparisons.
  // (We keep these in-repo to document unsupported behavior, but don't render them side-by-side.)
  .filter((name) => !name.startsWith("_unsupported."))
  // TODO: Fix transform for this fixture; excluded to avoid runtime error.
  .filter((name) => name !== "complex")
  .sort();

// Comparison component that renders input and output side by side
interface ComparisonProps {
  testCase: string;
}

// Find the module for a test case, trying different extensions
function findModule(
  modules: Record<string, { App: React.ComponentType }>,
  testCase: string,
  type: "input" | "output",
): { App: React.ComponentType } | undefined {
  // Try extensions in order: .tsx, .jsx, .flow.jsx
  const extensions = [
    `./${testCase}.${type}.tsx`,
    `./${testCase}.${type}.jsx`,
    `./${testCase}.flow.${type}.jsx`,
  ];
  for (const path of extensions) {
    if (modules[path]) return modules[path];
  }
  return undefined;
}

const getHostWindow = (): Window => {
  try {
    if (window.parent && window.parent.location) {
      return window.parent;
    }
  } catch {
    // Cross-origin access or other restrictions; fall back to the iframe.
  }
  return window;
};

const ensureStoryMode = (url: URL) => {
  if (!url.searchParams.get("viewMode")) {
    url.searchParams.set("viewMode", "story");
  }
};

const updateHostHash = (hostWindow: Window, id: string) => {
  const url = new URL(hostWindow.location.href);
  ensureStoryMode(url);
  url.hash = id;
  hostWindow.history.replaceState(null, "", url.toString());
};

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
};

const setupScrollPersistence = () => {
  const storageKey = "storybook:testcase-scroll-y";
  let ticking = false;
  const getScroller = () => document.scrollingElement ?? document.documentElement;

  const saveScroll = () => {
    if (ticking) {
      return;
    }
    ticking = true;
    requestAnimationFrame(() => {
      const scroller = getScroller();
      sessionStorage.setItem(storageKey, String(scroller.scrollTop));
      ticking = false;
    });
  };

  const restoreScroll = () => {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return;
    }
    const y = Number(raw);
    if (!Number.isFinite(y)) {
      return;
    }

    let attempts = 0;
    const tryRestore = () => {
      const scroller = getScroller();
      scroller.scrollTop = y;
      attempts += 1;
      if (
        attempts < 12 &&
        Math.abs(scroller.scrollTop - y) > 1 &&
        scroller.scrollHeight < y + scroller.clientHeight
      ) {
        requestAnimationFrame(tryRestore);
      }
    };

    requestAnimationFrame(tryRestore);
    setTimeout(tryRestore, 100);
  };

  window.addEventListener("scroll", saveScroll, { passive: true });
  window.addEventListener("beforeunload", saveScroll);
  restoreScroll();

  return () => {
    window.removeEventListener("scroll", saveScroll);
    window.removeEventListener("beforeunload", saveScroll);
  };
};

const Comparison: React.FC<ComparisonProps> = ({ testCase }) => {
  const InputComponent = findModule(inputModules, testCase, "input")?.App;
  const OutputComponent = findModule(outputModules, testCase, "output")?.App;

  return (
    <div style={{ display: "flex", gap: "2rem", padding: "1rem" }}>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: "0 0 1rem", fontFamily: "system-ui" }}>Input (styled-components)</h3>
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "1rem",
            background: "#fafafa",
          }}
        >
          {InputComponent ? (
            <RenderDebugFrame>
              <ThemeProvider theme={testCaseTheme}>
                <InputComponent />
              </ThemeProvider>
            </RenderDebugFrame>
          ) : (
            <div style={{ color: "#999" }}>No input file found</div>
          )}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: "0 0 1rem", fontFamily: "system-ui" }}>Output (StyleX)</h3>
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "1rem",
            background: "#fafafa",
          }}
        >
          {OutputComponent ? (
            <RenderDebugFrame>
              <ThemeProvider theme={testCaseTheme}>
                <OutputComponent />
              </ThemeProvider>
            </RenderDebugFrame>
          ) : (
            <div style={{ color: "#999" }}>No output file found</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Component that renders all test cases
const AllTestCases: React.FC = () => {
  React.useEffect(() => {
    const hostWindow = getHostWindow();

    // Restore from hash on initial load.
    if (hostWindow.location.hash) {
      scrollToId(hostWindow.location.hash.slice(1));
    }

    return setupScrollPersistence();
  }, []);

  return (
    <div>
      {testCaseNames.map((name) => (
        <div key={name} id={`testcase-${name}`} style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontFamily: "system-ui",
              padding: "0 1rem",
              margin: "1rem 0",
              borderBottom: "1px solid #e0e0e0",
              paddingBottom: "0.5rem",
            }}
          >
            <a
              href={`#testcase-${name}`}
              onClick={(event) => {
                event.preventDefault();
                const id = `testcase-${name}`;
                updateHostHash(getHostWindow(), id);
                scrollToId(id);
              }}
              style={{
                color: "inherit",
                textDecoration: "none",
                display: "inline-block",
                width: "100%",
              }}
            >
              {name}
            </a>
          </h2>
          <Comparison testCase={name} />
        </div>
      ))}
    </div>
  );
};

const meta: Meta = {
  title: "Test Cases",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj;

// Story showing all test cases on one page - this is the main entry point
// All test cases are auto-discovered and rendered side-by-side
export const All: Story = {
  render: () => <AllTestCases />,
};

// Helper to create a story for a specific test case
// Exported for use by the Vite plugin that injects individual story exports
export const createTestCaseStory = (name: string): Story => ({
  render: () => <Comparison testCase={name} />,
});

// Individual test case stories are automatically injected below this marker by
// the Vite plugin in .storybook/main.ts. The plugin reads the test-cases directory
// and generates exports like: export const basic = createTestCaseStory("basic");
// GENERATED_STORIES_MARKER
