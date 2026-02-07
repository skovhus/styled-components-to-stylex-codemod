// oxlint-disable no-console
import { useState, useEffect, useCallback, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { testCases } from "./lib/test-cases";
import { runTransform, type WarningLog } from "./lib/browser-transform";
import { DEFAULT_ADAPTER_CODE } from "./lib/default-adapter";
import { evalAdapter } from "./lib/eval-adapter";
import type { Adapter } from "../../src/adapter";
import { fixtureAdapter } from "../../src/__tests__/fixture-adapters";

const jsxExtension = javascript({ jsx: true, typescript: true });

function App() {
  const [selectedTestCase, setSelectedTestCase] = useState(testCases[0]?.name ?? "");
  const [input, setInput] = useState(testCases[0]?.content ?? "");
  const [adapterCode, setAdapterCode] = useState(DEFAULT_ADAPTER_CODE);
  const [showConfig, setShowConfig] = useState(false);
  const [output, setOutput] = useState("");
  const [warnings, setWarnings] = useState<WarningLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const lastValidAdapterRef = useRef<Adapter>(fixtureAdapter);
  const isUsingDefaultAdapter = adapterCode === DEFAULT_ADAPTER_CODE;

  // Parse adapter whenever adapterCode changes
  useEffect(() => {
    // If using the default code (the fixture-adapters source), use fixtureAdapter directly
    if (adapterCode === DEFAULT_ADAPTER_CODE) {
      lastValidAdapterRef.current = fixtureAdapter;
      setAdapterError(null);
      return;
    }

    // Otherwise, try to eval the custom adapter code
    try {
      const adapter = evalAdapter(adapterCode);
      lastValidAdapterRef.current = adapter;
      setAdapterError(null);
    } catch (e) {
      console.error(e);
      setAdapterError(e instanceof Error ? e.message : String(e));
      // Keep lastValidAdapterRef unchanged so we can still use it
    }
  }, [adapterCode]);

  // Transform whenever input or valid adapter changes
  useEffect(() => {
    const adapter = lastValidAdapterRef.current;
    try {
      const result = runTransform(input, adapter);
      setOutput(result.code ?? "// No transformations");
      setWarnings(result.warnings);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, adapterError, adapterCode]);

  // Handle test case selection
  const handleTestCaseChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedTestCase(name);
    const testCase = testCases.find((t) => t.name === name);
    if (testCase) {
      setInput(testCase.content);
    }
  }, []);

  // Navigate to previous test case
  const navigatePrev = useCallback(() => {
    const currentIndex = testCases.findIndex((t) => t.name === selectedTestCase);
    if (currentIndex > 0) {
      const prevTestCase = testCases[currentIndex - 1];
      if (!prevTestCase) {
        return;
      }
      setSelectedTestCase(prevTestCase.name);
      setInput(prevTestCase.content);
    }
  }, [selectedTestCase]);

  // Navigate to next test case
  const navigateNext = useCallback(() => {
    const currentIndex = testCases.findIndex((t) => t.name === selectedTestCase);
    if (currentIndex < testCases.length - 1) {
      const nextTestCase = testCases[currentIndex + 1];
      if (!nextTestCase) {
        return;
      }
      setSelectedTestCase(nextTestCase.name);
      setInput(nextTestCase.content);
    }
  }, [selectedTestCase]);

  // Handle J/K keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if the active element is an editor input
      const activeElement = document.activeElement;
      const isEditorFocused =
        activeElement?.closest(".cm-editor") !== null ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.tagName === "INPUT";

      if (isEditorFocused) {
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        navigateNext();
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        navigatePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigatePrev, navigateNext]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <a
            href="https://github.com/skovhus/styled-components-to-stylex-codemod"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.githubLink}
            title="View on GitHub"
          >
            <svg height="24" viewBox="0 0 16 16" width="24" style={styles.githubIcon}>
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </a>
          <h1 style={styles.title}>
            skovhus/styled-components-to-stylex-codemod
            {import.meta.env.VITE_PR_NUMBER && (
              <span style={styles.prBadge}>#{import.meta.env.VITE_PR_NUMBER}</span>
            )}
          </h1>
          <select value={selectedTestCase} onChange={handleTestCaseChange} style={styles.select}>
            {testCases.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <div style={styles.navButtons}>
            <button
              onClick={navigatePrev}
              style={styles.navButton}
              title="Go to previous test case (K)"
              disabled={testCases.findIndex((t) => t.name === selectedTestCase) === 0}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4L3 9h10L8 4z" />
              </svg>
            </button>
            <button
              onClick={navigateNext}
              style={styles.navButton}
              title="Go to next test case (J)"
              disabled={
                testCases.findIndex((t) => t.name === selectedTestCase) === testCases.length - 1
              }
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12L13 7H3l5 5z" />
              </svg>
            </button>
          </div>
        </div>
        <button onClick={() => setShowConfig(!showConfig)} style={styles.button}>
          {showConfig ? "Hide" : "Show"} Configuration
        </button>
      </header>

      {/* Configuration Panel (collapsible) */}
      {showConfig && (
        <div style={styles.configPanel}>
          <div style={styles.panelHeader}>Adapter configuration</div>
          <div style={styles.adapterStatus}>
            {adapterError
              ? "Adapter error: using last valid adapter"
              : isUsingDefaultAdapter
                ? "Using default fixture adapter"
                : "Using custom adapter"}
          </div>
          <CodeMirror
            value={adapterCode}
            onChange={setAdapterCode}
            height="180px"
            extensions={[jsxExtension]}
            theme="light"
          />
        </div>
      )}

      {/* Main editors */}
      <div style={styles.editorsContainer}>
        <div style={styles.editorPane}>
          <div style={styles.panelHeader}>Input (styled-components)</div>
          <div style={styles.editorWrapper}>
            <CodeMirror
              value={input}
              onChange={setInput}
              height="100%"
              extensions={[jsxExtension]}
              theme="light"
            />
          </div>
        </div>
        <div style={styles.editorPane}>
          <div style={styles.panelHeader}>Output (StyleX)</div>
          <div style={styles.outputContainer}>
            <div style={styles.editorWrapper}>
              {error ? (
                <pre style={styles.error}>{error}</pre>
              ) : (
                <CodeMirror
                  value={output}
                  readOnly
                  height="100%"
                  extensions={[jsxExtension]}
                  theme="light"
                />
              )}
            </div>
            <div style={styles.issueBar}>
              <a
                href="https://github.com/skovhus/styled-components-to-stylex-codemod/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.issueLink}
              >
                Suggest improvement
              </a>
            </div>
            {(adapterError || warnings.length > 0) && (
              <div style={styles.warningsPanel}>
                <div style={styles.warningsHeader}>
                  Warnings ({warnings.length + (adapterError ? 1 : 0)})
                </div>
                <ul style={styles.warningsList}>
                  {adapterError && (
                    <li style={styles.warningItem}>
                      <span style={styles.warningFeature}>adapter-config</span>
                      <span style={styles.warningMessage}>{adapterError}</span>
                    </li>
                  )}
                  {warnings.map((w, i) => (
                    <li key={i} style={styles.warningItem}>
                      <span style={styles.warningMessage}>{w.type}</span>
                      {w.loc && <span style={styles.warningLoc}>line {w.loc.line}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #e0e0e0",
    backgroundColor: "#f8f9fa",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  issueBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "8px 12px",
    borderTop: "1px solid #e0e0e0",
    backgroundColor: "#f8f9fa",
  },
  issueLink: {
    fontSize: "12px",
    color: "#666",
    textDecoration: "none",
  },
  githubLink: {
    display: "flex",
    alignItems: "center",
    color: "#333",
    textDecoration: "none",
  },
  githubIcon: {
    display: "block",
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#333",
  },
  prBadge: {
    marginLeft: "6px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#0969da",
  },
  select: {
    padding: "6px 12px",
    paddingRight: "24px",
    fontSize: "14px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    backgroundColor: "white",
    cursor: "pointer",
    appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 8L2 4h8L6 8z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 4px center",
  },
  button: {
    padding: "8px 16px",
    fontSize: "14px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    backgroundColor: "white",
    cursor: "pointer",
  },
  navButtons: {
    display: "flex",
    gap: "4px",
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    fontSize: "14px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    backgroundColor: "white",
    cursor: "pointer",
    color: "#333",
  },
  configPanel: {
    borderBottom: "1px solid #e0e0e0",
    backgroundColor: "#fafafa",
  },
  panelHeader: {
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#f0f0f0",
    borderBottom: "1px solid #e0e0e0",
  },
  editorsContainer: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
  editorPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #e0e0e0",
    minWidth: 0,
  },
  outputContainer: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  editorWrapper: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
  },
  adapterStatus: {
    fontSize: "12px",
    color: "#666",
    margin: "8px 12px",
  },
  error: {
    color: "#c00",
    padding: "16px",
    margin: 0,
    fontFamily: "monospace",
    fontSize: "13px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  warningsPanel: {
    borderTop: "1px solid #e0e0e0",
    backgroundColor: "#fffbeb",
    maxHeight: "150px",
    overflow: "auto",
  },
  warningsHeader: {
    padding: "6px 12px",
    fontSize: "11px",
    fontWeight: 600,
    color: "#92400e",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#fef3c7",
    borderBottom: "1px solid #fcd34d",
    position: "sticky" as const,
    top: 0,
  },
  warningsList: {
    margin: 0,
    padding: "8px 12px",
    listStyle: "none",
  },
  warningItem: {
    display: "flex",
    gap: "8px",
    alignItems: "baseline",
    padding: "4px 0",
    fontSize: "12px",
    borderBottom: "1px solid #fde68a",
  },
  warningFeature: {
    fontWeight: 600,
    color: "#92400e",
    fontFamily: "monospace",
  },
  warningMessage: {
    color: "#78350f",
    flex: 1,
  },
  warningLoc: {
    color: "#a16207",
    fontFamily: "monospace",
    fontSize: "11px",
  },
};

export default App;
