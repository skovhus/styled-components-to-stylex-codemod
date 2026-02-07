// oxlint-disable no-console
import { useState, useEffect, useCallback, useRef, Component } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import Select, { type SingleValue, type StylesConfig } from "react-select";
import { ThemeProvider } from "styled-components";
import { loadTestCaseModule, testCases } from "./lib/test-cases";
import { runTransform, type WarningLog } from "./lib/browser-transform";
import { DEFAULT_ADAPTER_CODE } from "./lib/default-adapter";
import { evalAdapter } from "./lib/eval-adapter";
import type { Adapter } from "../../src/adapter";
import { fixtureAdapter } from "../../src/__tests__/fixture-adapters";
import { testCaseTheme } from "../../test-cases/tokens.stylex";

export default function App() {
  const [initialState] = useState<InitialPlaygroundState>(() =>
    readInitialPlaygroundStateFromUrl(),
  );
  const [selectedTestCase, setSelectedTestCase] = useState(initialState.selectedTestCase);
  const [input, setInput] = useState(initialState.input);
  const [adapterCode, setAdapterCode] = useState(DEFAULT_ADAPTER_CODE);
  const [showConfig, setShowConfig] = useState(initialState.showConfig);
  const [showRendering, setShowRendering] = useState(initialState.showRendering);
  const [hideCode] = useState(initialState.hideCode);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [output, setOutput] = useState("");
  const [warnings, setWarnings] = useState<WarningLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const lastValidAdapterRef = useRef<Adapter>(fixtureAdapter);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const isUsingDefaultAdapter = adapterCode === DEFAULT_ADAPTER_CODE;
  const [renderState, setRenderState] = useState<RenderState>(initialRenderState);
  const shouldShowRendering = showRendering || hideCode;

  const selectTestCaseByName = useCallback((name: string) => {
    setSelectedTestCase(name);
    const testCase = testCases.find((t) => t.name === name);
    if (testCase) {
      setInput(testCase.content);
    }
  }, []);

  useEffect(() => {
    if (hideCode) {
      setShowRendering(true);
    }
  }, [hideCode]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const host = settingsMenuRef.current;
      if (!host) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!host.contains(target)) {
        setIsSettingsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    updatePlaygroundUrlSearchParams({ selectedTestCase, showRendering, showConfig, hideCode });
  }, [selectedTestCase, showRendering, showConfig, hideCode]);

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

  useEffect(() => {
    if (!shouldShowRendering || !selectedTestCase) {
      setRenderState(initialRenderState);
      return;
    }

    let cancelled = false;
    setRenderState((prevState) => ({
      ...prevState,
      loading: true,
      inputError: null,
      outputError: null,
    }));

    const loadModules = async () => {
      const [inputResult, outputResult] = await Promise.allSettled([
        loadTestCaseModule(selectedTestCase, "input"),
        loadTestCaseModule(selectedTestCase, "output"),
      ]);

      if (cancelled) {
        return;
      }

      const inputModule = inputResult.status === "fulfilled" ? inputResult.value : null;
      const outputModule = outputResult.status === "fulfilled" ? outputResult.value : null;

      setRenderState({
        input: inputModule?.App ?? null,
        output: outputModule?.App ?? null,
        inputError:
          inputResult.status === "rejected" ? formatErrorMessage(inputResult.reason) : null,
        outputError:
          outputResult.status === "rejected" ? formatErrorMessage(outputResult.reason) : null,
        loading: false,
      });
    };

    void loadModules();

    return () => {
      cancelled = true;
    };
  }, [shouldShowRendering, selectedTestCase]);

  // Handle test case selection
  const handleTestCaseChange = useCallback(
    (value: SingleValue<TestCaseOption>) => {
      if (!value) {
        return;
      }
      selectTestCaseByName(value.value);
    },
    [selectTestCaseByName],
  );

  // Navigate to previous test case
  const navigatePrev = useCallback(() => {
    const currentIndex = testCases.findIndex((t) => t.name === selectedTestCase);
    if (currentIndex > 0) {
      const prevTestCase = testCases[currentIndex - 1];
      if (!prevTestCase) {
        return;
      }
      selectTestCaseByName(prevTestCase.name);
    }
  }, [selectedTestCase, selectTestCaseByName]);

  // Navigate to next test case
  const navigateNext = useCallback(() => {
    const currentIndex = testCases.findIndex((t) => t.name === selectedTestCase);
    if (currentIndex < testCases.length - 1) {
      const nextTestCase = testCases[currentIndex + 1];
      if (!nextTestCase) {
        return;
      }
      selectTestCaseByName(nextTestCase.name);
    }
  }, [selectedTestCase, selectTestCaseByName]);

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
    <div className="pg-container" style={styles.container}>
      {/* Header */}
      <header className="pg-header" style={styles.header}>
        <div className="pg-header-left" style={styles.headerLeft}>
          <a
            href="https://github.com/skovhus/styled-components-to-stylex-codemod"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.githubLink}
            title="View on GitHub"
          >
            <svg
              className="pg-github-icon"
              height="24"
              viewBox="0 0 16 16"
              width="24"
              style={styles.githubIcon}
            >
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </a>
          <h1 className="pg-title" style={styles.title}>
            skovhus/styled-components-to-stylex-codemod
            {import.meta.env.VITE_PR_NUMBER && (
              <a
                href={`https://github.com/skovhus/styled-components-to-stylex-codemod/pull/${import.meta.env.VITE_PR_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.prLink}
              >
                #{import.meta.env.VITE_PR_NUMBER}
              </a>
            )}
          </h1>
          <div className="pg-select-host" style={styles.testCaseSelectHost}>
            <Select<TestCaseOption, false>
              inputId="test-case-select"
              aria-label="Select test case"
              isSearchable
              isClearable={false}
              options={testCaseOptions}
              value={testCaseOptions.find((o) => o.value === selectedTestCase) ?? null}
              onChange={handleTestCaseChange}
              styles={testCaseSelectStyles}
            />
          </div>
          <div className="pg-nav-buttons" style={styles.navButtons}>
            <button
              className="pg-nav-button"
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
              className="pg-nav-button"
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
        <div className="pg-header-right" style={styles.headerRight}>
          <div style={styles.settingsHost} ref={settingsMenuRef}>
            <button
              className="pg-settings-btn"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              style={styles.button}
              aria-haspopup="menu"
              aria-expanded={isSettingsOpen}
            >
              Settings
            </button>
            {isSettingsOpen && (
              <div
                className="pg-settings-menu"
                style={styles.settingsMenu}
                role="menu"
                aria-label="Playground settings"
              >
                <label style={styles.settingsItem}>
                  <input
                    type="checkbox"
                    checked={hideCode ? true : showRendering}
                    disabled={hideCode}
                    onChange={(event) => setShowRendering(event.target.checked)}
                  />
                  <span style={styles.settingsLabel}>Show rendering</span>
                </label>

                <label style={styles.settingsItem}>
                  <input
                    type="checkbox"
                    checked={showConfig}
                    onChange={(event) => setShowConfig(event.target.checked)}
                  />
                  <span style={styles.settingsLabel}>Show config</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Configuration Panel (collapsible) */}
      {showConfig && (
        <div className="pg-config-panel" style={styles.configPanel}>
          <div className="pg-panel-header" style={styles.panelHeader}>
            Adapter configuration
          </div>
          <div className="pg-adapter-status" style={styles.adapterStatus}>
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
            style={codeMirrorStyle}
            theme="light"
          />
        </div>
      )}

      {/* Main editors */}
      {!hideCode && (
        <div className="pg-editors" style={styles.editorsContainer}>
          <div className="pg-editor-pane" style={styles.editorPane}>
            <div className="pg-panel-header" style={styles.panelHeader}>
              Input (styled-components)
            </div>
            <div style={styles.editorWrapper}>
              <CodeMirror
                value={input}
                onChange={setInput}
                height="100%"
                extensions={[jsxExtension]}
                style={codeMirrorStyle}
                theme="light"
              />
            </div>
          </div>
          <div className="pg-editor-pane" style={styles.editorPane}>
            <div className="pg-panel-header" style={styles.panelHeader}>
              Output (StyleX)
            </div>
            <div style={styles.outputContainer}>
              <div style={styles.editorWrapper}>
                {error ? (
                  <pre className="pg-error" style={styles.error}>
                    {error}
                  </pre>
                ) : (
                  <CodeMirror
                    value={output}
                    readOnly
                    height="100%"
                    extensions={[jsxExtension]}
                    style={codeMirrorStyle}
                    theme="light"
                  />
                )}
              </div>
              <div className="pg-issue-bar" style={styles.issueBar}>
                <a
                  className="pg-issue-link"
                  href="https://github.com/skovhus/styled-components-to-stylex-codemod/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.issueLink}
                >
                  Suggest improvement
                </a>
              </div>
              {(adapterError || warnings.length > 0) && (
                <div className="pg-warnings-panel" style={styles.warningsPanel}>
                  <div className="pg-warnings-header" style={styles.warningsHeader}>
                    Warnings ({warnings.length + (adapterError ? 1 : 0)})
                  </div>
                  <ul style={styles.warningsList}>
                    {adapterError && (
                      <li className="pg-warning-item" style={styles.warningItem}>
                        <span style={styles.warningFeature}>adapter-config</span>
                        <span style={styles.warningMessage}>{adapterError}</span>
                      </li>
                    )}
                    {warnings.map((w, i) => (
                      <li className="pg-warning-item" key={i} style={styles.warningItem}>
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
      )}
      {shouldShowRendering && (
        <div
          className="pg-render-panel"
          style={hideCode ? styles.renderPanelFullHeight : styles.renderPanel}
        >
          <div className="pg-render-panel-header" style={styles.renderPanelHeader}>
            <span>Rendered preview</span>
            <span className="pg-render-panel-note" style={styles.renderPanelNote}>
              Fixture components only (editor changes are not rendered)
            </span>
          </div>
          <div className="pg-render-body" style={styles.renderPanelBody}>
            <PreviewPane
              title="Input (styled-components)"
              component={renderState.input}
              error={renderState.inputError}
              loading={renderState.loading}
              emptyMessage={
                selectedTestCase
                  ? "No input fixture found for this test case."
                  : "Select a test case."
              }
              resetKey={`${selectedTestCase}-input`}
            />
            <PreviewPane
              title="Output (StyleX)"
              component={renderState.output}
              error={renderState.outputError}
              loading={renderState.loading}
              emptyMessage={
                selectedTestCase
                  ? "No output fixture found for this test case."
                  : "Select a test case."
              }
              resetKey={`${selectedTestCase}-output`}
              isLast
            />
          </div>
        </div>
      )}
    </div>
  );
}

const jsxExtension = javascript({ jsx: true, typescript: true });

type TestCaseOption = { value: string; label: string };

const codeMirrorStyle: React.CSSProperties = {
  fontSize: "12px",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  lineHeight: 1.5,
};

type RenderState = {
  input: React.ComponentType<Record<string, never>> | null;
  output: React.ComponentType<Record<string, never>> | null;
  inputError: string | null;
  outputError: string | null;
  loading: boolean;
};

const initialRenderState: RenderState = {
  input: null,
  output: null,
  inputError: null,
  outputError: null,
  loading: false,
};

const testCaseOptions: TestCaseOption[] = testCases.map((t) => ({ value: t.name, label: t.name }));

const testCaseSelectStyles: StylesConfig<TestCaseOption, false> = {
  container: (base) => ({ ...base, width: 320 }),
  control: (base) => ({
    ...base,
    minHeight: 30,
    height: 30,
    borderRadius: 6,
    borderColor: "#ccc",
    boxShadow: "none",
    fontSize: 13,
  }),
  valueContainer: (base) => ({ ...base, padding: "0 8px" }),
  input: (base) => ({ ...base, margin: 0, padding: 0 }),
  singleValue: (base) => ({ ...base, fontSize: 13 }),
  placeholder: (base) => ({ ...base, fontSize: 13 }),
  option: (base) => ({ ...base, fontSize: 13 }),
  indicatorsContainer: (base) => ({ ...base, height: 30 }),
  dropdownIndicator: (base) => ({ ...base, padding: "0 4px" }),
  indicatorSeparator: () => ({ display: "none" }),
  menu: (base) => ({ ...base, zIndex: 20 }),
};

type InitialPlaygroundState = {
  selectedTestCase: string;
  input: string;
  showRendering: boolean;
  showConfig: boolean;
  hideCode: boolean;
};

const readInitialPlaygroundStateFromUrl = (): InitialPlaygroundState => {
  const defaultTestCase = testCases[0] ?? null;
  const defaultTestCaseName = defaultTestCase?.name ?? "";
  const defaultInput = defaultTestCase?.content ?? "";

  if (typeof window === "undefined") {
    return {
      selectedTestCase: defaultTestCaseName,
      input: defaultInput,
      showRendering: true,
      showConfig: false,
      hideCode: false,
    };
  }

  const url = safeParseUrl(window.location.href);
  if (!url) {
    return {
      selectedTestCase: defaultTestCaseName,
      input: defaultInput,
      showRendering: true,
      showConfig: false,
      hideCode: false,
    };
  }

  const showRenderingInFullMode = parseShowRenderingInFullMode(url.searchParams);
  const showConfigInFullMode =
    url.searchParams.has("showConfig") || url.searchParams.get("config") === "1";

  const hideCode = url.searchParams.has("hideCode") || url.searchParams.get("view") === "rendering";
  const showRendering = hideCode ? true : showRenderingInFullMode;
  const showConfig = showConfigInFullMode;

  const requestedTestCase = url.searchParams.get("testCase");
  const selectedTestCase = resolveTestCaseName(requestedTestCase) ?? defaultTestCaseName;
  const input =
    testCases.find((t) => t.name === selectedTestCase)?.content ??
    testCases.find((t) => t.name === defaultTestCaseName)?.content ??
    defaultInput;

  return { selectedTestCase, input, showRendering, showConfig, hideCode };
};

const updatePlaygroundUrlSearchParams = ({
  selectedTestCase,
  showRendering,
  showConfig,
  hideCode,
}: {
  selectedTestCase: string;
  showRendering: boolean;
  showConfig: boolean;
  hideCode: boolean;
}) => {
  if (typeof window === "undefined") {
    return;
  }

  const url = safeParseUrl(window.location.href);
  if (!url) {
    return;
  }

  const defaultTestCaseName = testCases[0]?.name ?? "";
  if (selectedTestCase && selectedTestCase !== defaultTestCaseName) {
    url.searchParams.set("testCase", selectedTestCase);
  } else {
    url.searchParams.delete("testCase");
  }

  if (hideCode) {
    url.searchParams.set("hideCode", "");
  } else {
    url.searchParams.delete("hideCode");
  }

  if (hideCode) {
    url.searchParams.delete("showRendering");
  } else if (showRendering) {
    url.searchParams.delete("showRendering");
  } else {
    // Default is enabled. Only include param when explicitly disabled.
    url.searchParams.set("showRendering", "0");
  }

  if (showConfig) {
    url.searchParams.set("showConfig", "");
  } else {
    url.searchParams.delete("showConfig");
  }

  // Legacy cleanup (we only write the new params)
  url.searchParams.delete("view");
  url.searchParams.delete("render");
  url.searchParams.delete("config");

  window.history.replaceState(null, "", url.toString());
};

const parseShowRenderingInFullMode = (searchParams: URLSearchParams): boolean => {
  // Default is enabled.
  if (!searchParams.has("showRendering") && searchParams.get("render") !== "1") {
    return true;
  }

  // Legacy: render=1 meant enabled.
  if (searchParams.get("render") === "1") {
    return true;
  }

  // `showRendering` is a tri-state param:
  // - absent: default (enabled)
  // - present with no value: enabled
  // - showRendering=0|false: explicitly disabled
  const raw = searchParams.get("showRendering");
  if (!raw) {
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "0" || normalized === "false") {
    return false;
  }
  return true;
};

const safeParseUrl = (href: string): URL | null => {
  try {
    return new URL(href);
  } catch {
    return null;
  }
};

const resolveTestCaseName = (name: string | null): string | null => {
  if (!name) {
    return null;
  }
  const exists = testCases.some((t) => t.name === name);
  return exists ? name : null;
};

const formatErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type RenderErrorBoundaryProps = {
  resetKey: string;
  fallback: (error: Error) => React.ReactNode;
  children: React.ReactNode;
};

type RenderErrorBoundaryState = {
  error: Error | null;
};

class RenderErrorBoundary extends Component<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
  state: RenderErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RenderErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: RenderErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("Render preview error", error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

type PreviewPaneProps = {
  title: string;
  component: React.ComponentType<Record<string, never>> | null;
  error: string | null;
  loading: boolean;
  emptyMessage: string;
  resetKey: string;
  isLast?: boolean;
};

function PreviewPane({
  title,
  component,
  error,
  loading,
  emptyMessage,
  resetKey,
  isLast = false,
}: PreviewPaneProps) {
  const ComponentToRender = component;
  const paneStyle = isLast ? { ...styles.renderPane, borderRight: "none" } : styles.renderPane;

  return (
    <div className="pg-render-pane" style={paneStyle}>
      <div className="pg-render-pane-header" style={styles.renderPaneHeader}>
        {title}
      </div>
      <div className="pg-render-pane-body" style={styles.renderPaneBody}>
        {loading ? (
          <div style={styles.renderPlaceholder}>Loading preview...</div>
        ) : error ? (
          <pre style={styles.renderError}>{error}</pre>
        ) : ComponentToRender ? (
          <RenderErrorBoundary
            resetKey={resetKey}
            fallback={(renderError) => (
              <pre style={styles.renderError}>{formatErrorMessage(renderError)}</pre>
            )}
          >
            <ThemeProvider theme={testCaseTheme}>
              <ComponentToRender />
            </ThemeProvider>
          </RenderErrorBoundary>
        ) : (
          <div style={styles.renderPlaceholder}>{emptyMessage}</div>
        )}
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
  testCaseSelectHost: {
    display: "flex",
    alignItems: "center",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  settingsHost: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  settingsMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    minWidth: "220px",
    backgroundColor: "#fff",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: "8px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
    padding: "10px 10px",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  settingsItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    color: "#333",
    userSelect: "none",
    cursor: "pointer",
  },
  settingsLabel: {
    fontWeight: 500,
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
  prLink: {
    marginLeft: "6px",
    color: "#0969da",
    textDecoration: "none",
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
  renderPanel: {
    borderTop: "1px solid #e0e0e0",
    backgroundColor: "#fff",
    display: "flex",
    flexDirection: "column",
    height: "280px",
  },
  renderPanelFullHeight: {
    borderTop: "1px solid #e0e0e0",
    backgroundColor: "#fff",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  renderPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    fontSize: "11px",
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#f0f0f0",
    borderBottom: "1px solid #e0e0e0",
  },
  renderPanelNote: {
    fontSize: "11px",
    fontWeight: 400,
    color: "#888",
    textTransform: "none",
    letterSpacing: "normal",
  },
  renderPanelBody: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  renderPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #e0e0e0",
    minWidth: 0,
  },
  renderPaneHeader: {
    padding: "6px 12px",
    fontSize: "11px",
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#fafafa",
    borderBottom: "1px solid #e0e0e0",
  },
  renderPaneBody: {
    flex: 1,
    padding: "12px",
    overflow: "auto",
    backgroundColor: "#fafafa",
  },
  renderPlaceholder: {
    fontSize: "11px",
    color: "#888",
  },
  renderError: {
    color: "#c00",
    padding: 0,
    margin: 0,
    fontFamily: "monospace",
    fontSize: "12px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  configPanel: {
    borderBottom: "1px solid #e0e0e0",
    backgroundColor: "#fafafa",
  },
  panelHeader: {
    padding: "8px 12px",
    fontSize: "11px",
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
    fontSize: "11px",
    color: "#666",
    margin: "8px 12px",
  },
  error: {
    color: "#c00",
    padding: "16px",
    margin: 0,
    fontFamily: "monospace",
    fontSize: "12px",
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
    fontSize: "11px",
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
