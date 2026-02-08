// oxlint-disable no-console
import { useState, useEffect, useCallback, useRef, Component } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import Select, { type SingleValue } from "react-select";
import { ThemeProvider } from "styled-components";
import * as stylex from "@stylexjs/stylex";
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
    <div {...stylex.props(s.container)}>
      {/* Header */}
      <header {...stylex.props(s.header)}>
        <div {...stylex.props(s.headerLeft)}>
          <a
            href="https://github.com/skovhus/styled-components-to-stylex-codemod"
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(s.githubLink)}
            title="View on GitHub"
          >
            <svg viewBox="0 0 16 16" {...stylex.props(s.githubIcon)}>
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </a>
          <h1 {...stylex.props(s.title)}>
            skovhus/styled-components-to-stylex-codemod
            {import.meta.env.VITE_PR_NUMBER && (
              <a
                href={`https://github.com/skovhus/styled-components-to-stylex-codemod/pull/${import.meta.env.VITE_PR_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                {...stylex.props(s.prLink)}
              >
                #{import.meta.env.VITE_PR_NUMBER}
              </a>
            )}
          </h1>
          <div {...stylex.props(s.testCaseSelectHost)}>
            <Select<TestCaseOption, false>
              inputId="test-case-select"
              aria-label="Select test case"
              isSearchable
              isClearable={false}
              options={testCaseOptions}
              value={testCaseOptions.find((o) => o.value === selectedTestCase) ?? null}
              onChange={handleTestCaseChange}
              menuPortalTarget={document.body}
            />
          </div>
          <div {...stylex.props(s.navButtons)}>
            <button
              onClick={navigatePrev}
              {...stylex.props(s.navButton)}
              title="Go to previous test case (K)"
              disabled={testCases.findIndex((t) => t.name === selectedTestCase) === 0}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" {...stylex.props(s.navIcon)}>
                <path d="M8 4L3 9h10L8 4z" />
              </svg>
            </button>
            <button
              onClick={navigateNext}
              {...stylex.props(s.navButton)}
              title="Go to next test case (J)"
              disabled={
                testCases.findIndex((t) => t.name === selectedTestCase) === testCases.length - 1
              }
            >
              <svg viewBox="0 0 16 16" fill="currentColor" {...stylex.props(s.navIcon)}>
                <path d="M8 12L13 7H3l5 5z" />
              </svg>
            </button>
          </div>
        </div>
        <div {...stylex.props(s.headerRight)}>
          <div {...stylex.props(s.settingsHost)} ref={settingsMenuRef}>
            <button
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              {...stylex.props(s.settingsButton)}
              aria-haspopup="menu"
              aria-expanded={isSettingsOpen}
              aria-label="Settings"
              title="Settings"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                {...stylex.props(s.settingsIcon)}
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {isSettingsOpen && (
              <div {...stylex.props(s.settingsMenu)} role="menu" aria-label="Playground settings">
                <label {...stylex.props(s.settingsItem)}>
                  <input
                    type="checkbox"
                    checked={hideCode ? true : showRendering}
                    disabled={hideCode}
                    onChange={(event) => setShowRendering(event.target.checked)}
                  />
                  <span {...stylex.props(s.settingsLabel)}>Show rendering</span>
                </label>

                <label {...stylex.props(s.settingsItem)}>
                  <input
                    type="checkbox"
                    checked={showConfig}
                    onChange={(event) => setShowConfig(event.target.checked)}
                  />
                  <span {...stylex.props(s.settingsLabel)}>Show config</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Configuration Panel (collapsible) */}
      {showConfig && (
        <div {...stylex.props(s.configPanel)}>
          <div {...stylex.props(s.panelHeader)}>Adapter configuration</div>
          <div {...stylex.props(s.adapterStatus)}>
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
            {...stylex.props(s.codeMirror)}
            theme="light"
          />
        </div>
      )}

      {/* Main editors */}
      {!hideCode && (
        <div {...stylex.props(s.editorsContainer)}>
          <div {...stylex.props(s.editorPane)}>
            <div {...stylex.props(s.panelHeader)}>Input (styled-components)</div>
            <div {...stylex.props(s.editorWrapper)}>
              <CodeMirror
                value={input}
                onChange={setInput}
                height="100%"
                extensions={[jsxExtension]}
                {...stylex.props(s.codeMirror)}
                theme="light"
              />
            </div>
          </div>
          <div {...stylex.props(s.editorPane)}>
            <div {...stylex.props(s.panelHeader)}>Output (StyleX)</div>
            <div {...stylex.props(s.outputContainer)}>
              <div {...stylex.props(s.editorWrapper)}>
                {error ? (
                  <pre {...stylex.props(s.error)}>{error}</pre>
                ) : (
                  <CodeMirror
                    value={output}
                    readOnly
                    height="100%"
                    extensions={[jsxExtension]}
                    {...stylex.props(s.codeMirror)}
                    theme="light"
                  />
                )}
              </div>
              <div {...stylex.props(s.issueBar)}>
                <a
                  href="https://github.com/skovhus/styled-components-to-stylex-codemod/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...stylex.props(s.issueLink)}
                >
                  Suggest improvement
                </a>
              </div>
              {(adapterError || warnings.length > 0) && (
                <div {...stylex.props(s.warningsPanel)}>
                  <div {...stylex.props(s.warningsHeader)}>
                    Warnings ({warnings.length + (adapterError ? 1 : 0)})
                  </div>
                  <ul {...stylex.props(s.warningsList)}>
                    {adapterError && (
                      <li {...stylex.props(s.warningItem)}>
                        <span {...stylex.props(s.warningFeature)}>adapter-config</span>
                        <span {...stylex.props(s.warningMessage)}>{adapterError}</span>
                      </li>
                    )}
                    {warnings.map((w, i) => (
                      <li key={i} {...stylex.props(s.warningItem)}>
                        <span {...stylex.props(s.warningMessage)}>{w.type}</span>
                        {w.loc && <span {...stylex.props(s.warningLoc)}>line {w.loc.line}</span>}
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
        <div {...stylex.props(s.renderPanel, hideCode && s.renderPanelFullHeight)}>
          <div {...stylex.props(s.renderPanelHeader)}>
            <span>Render</span>
            <span {...stylex.props(s.renderPanelNote)}>Editor changes are not rendered</span>
          </div>
          <div {...stylex.props(s.renderPanelBody)}>
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

  return (
    <div {...stylex.props(s.renderPane, isLast && s.renderPaneLast)}>
      <div {...stylex.props(s.renderPaneHeader)}>{title}</div>
      <div {...stylex.props(s.renderPaneBody)}>
        {loading ? (
          <div {...stylex.props(s.renderPlaceholder)}>Loading preview...</div>
        ) : error ? (
          <pre {...stylex.props(s.renderError)}>{error}</pre>
        ) : ComponentToRender ? (
          <RenderErrorBoundary
            resetKey={resetKey}
            fallback={(renderError) => (
              <pre {...stylex.props(s.renderError)}>{formatErrorMessage(renderError)}</pre>
            )}
          >
            <ThemeProvider theme={testCaseTheme}>
              <ComponentToRender />
            </ThemeProvider>
          </RenderErrorBoundary>
        ) : (
          <div {...stylex.props(s.renderPlaceholder)}>{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}

// ── Media query breakpoints ──
const MOBILE = "@media (max-width: 768px)";
const PHONE = "@media (max-width: 480px)";

const s = stylex.create({
  // ── Layout ──
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: {
      default: null,
      [MOBILE]: 13,
    },
  },

  // ── Header ──
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: {
      default: 12,
      [MOBILE]: 8,
      [PHONE]: 6,
    },
    paddingInline: {
      default: 16,
      [MOBILE]: 10,
      [PHONE]: 8,
    },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e0e0e0",
    backgroundColor: "#f8f9fa",
    gap: {
      default: null,
      [MOBILE]: 6,
    },
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: {
      default: 12,
      [MOBILE]: 6,
    },
    flex: {
      default: null,
      [MOBILE]: 1,
    },
    minWidth: {
      default: null,
      [MOBILE]: 0,
    },
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: {
      default: null,
      [MOBILE]: 0,
    },
  },

  // ── GitHub link ──
  githubLink: {
    display: "flex",
    alignItems: "center",
    color: "#333",
    textDecoration: "none",
  },
  githubIcon: {
    display: "block",
    width: {
      default: 24,
      [MOBILE]: 20,
    },
    height: {
      default: 24,
      [MOBILE]: 20,
    },
  },

  // ── Title ──
  title: {
    margin: 0,
    fontSize: {
      default: 18,
      [MOBILE]: 12,
    },
    fontWeight: 600,
    color: "#333",
    whiteSpace: {
      default: null,
      [MOBILE]: "nowrap",
    },
    overflow: {
      default: null,
      [MOBILE]: "hidden",
    },
    textOverflow: {
      default: null,
      [MOBILE]: "ellipsis",
    },
    flexShrink: {
      default: null,
      [MOBILE]: 1,
    },
    minWidth: {
      default: null,
      [MOBILE]: 0,
    },
    display: {
      default: null,
      [PHONE]: "none",
    },
  },
  prLink: {
    marginLeft: 6,
    color: "#0969da",
    textDecoration: "none",
  },

  // ── Test case select ──
  testCaseSelectHost: {
    display: "flex",
    alignItems: "center",
    maxWidth: {
      default: 320,
      [MOBILE]: "none",
    },
    width: {
      default: null,
      [MOBILE]: "100%",
    },
    flex: {
      default: null,
      [MOBILE]: 1,
    },
    minWidth: {
      default: null,
      [MOBILE]: 80,
    },
  },

  // ── Nav buttons ──
  navButtons: {
    display: "flex",
    gap: {
      default: 4,
      [MOBILE]: 2,
    },
    flexShrink: {
      default: null,
      [MOBILE]: 0,
    },
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: {
      default: 6,
      [MOBILE]: 4,
    },
    fontSize: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    backgroundColor: "white",
    cursor: "pointer",
    color: "#333",
  },
  navIcon: {
    width: {
      default: 16,
      [MOBILE]: 14,
    },
    height: {
      default: 16,
      [MOBILE]: 14,
    },
  },

  // ── Settings ──
  settingsHost: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  settingsButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: {
      default: 6,
      [MOBILE]: 5,
    },
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    backgroundColor: "white",
    cursor: "pointer",
    color: "#555",
  },
  settingsIcon: {
    width: {
      default: 18,
      [MOBILE]: 16,
    },
    height: {
      default: 18,
      [MOBILE]: 16,
    },
  },
  settingsMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    minWidth: {
      default: 220,
      [MOBILE]: 180,
    },
    backgroundColor: "#fff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 8,
    boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
    padding: {
      default: 10,
      [MOBILE]: 8,
    },
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontSize: {
      default: null,
      [MOBILE]: 12,
    },
  },
  settingsItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#333",
    userSelect: "none",
    cursor: "pointer",
  },
  settingsLabel: {
    fontWeight: 500,
  },

  // ── Issue bar ──
  issueBar: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBlock: {
      default: 8,
      [MOBILE]: 5,
    },
    paddingInline: {
      default: 12,
      [MOBILE]: 8,
    },
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "#e0e0e0",
    backgroundColor: "#f8f9fa",
  },
  issueLink: {
    fontSize: {
      default: 12,
      [MOBILE]: 11,
    },
    color: "#666",
    textDecoration: "none",
  },

  // ── Config panel ──
  configPanel: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e0e0e0",
    backgroundColor: "#fafafa",
  },
  adapterStatus: {
    fontSize: {
      default: 11,
      [MOBILE]: 10,
    },
    color: "#666",
    marginBlock: {
      default: 8,
      [MOBILE]: 5,
    },
    marginInline: {
      default: 12,
      [MOBILE]: 8,
    },
  },

  // ── Panel headers ──
  panelHeader: {
    paddingBlock: {
      default: 8,
      [MOBILE]: 5,
    },
    paddingInline: {
      default: 12,
      [MOBILE]: 8,
    },
    fontSize: {
      default: 11,
      [MOBILE]: 10,
    },
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e0e0e0",
  },

  // ── Code editors ──
  editorsContainer: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    flexDirection: {
      default: "row",
      [MOBILE]: "column",
    },
  },
  editorPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRightWidth: {
      default: 1,
      [MOBILE]: 0,
    },
    borderRightStyle: {
      default: "solid",
      [MOBILE]: "none",
    },
    borderRightColor: {
      default: "#e0e0e0",
      [MOBILE]: null,
    },
    borderBottomWidth: {
      default: null,
      [MOBILE]: 1,
    },
    borderBottomStyle: {
      default: null,
      [MOBILE]: "solid",
    },
    borderBottomColor: {
      default: null,
      [MOBILE]: "#e0e0e0",
    },
    minWidth: 0,
    minHeight: {
      default: null,
      [MOBILE]: 200,
      [PHONE]: 160,
    },
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
  codeMirror: {
    fontSize: {
      default: 12,
      [MOBILE]: 11,
      [PHONE]: 10,
    },
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    lineHeight: 1.5,
  },

  // ── Error display ──
  error: {
    color: "#c00",
    padding: {
      default: 16,
      [MOBILE]: 10,
    },
    margin: 0,
    fontFamily: "monospace",
    fontSize: {
      default: 12,
      [MOBILE]: 11,
    },
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },

  // ── Warnings ──
  warningsPanel: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fffbeb",
    maxHeight: {
      default: 150,
      [MOBILE]: 100,
    },
    overflow: "auto",
  },
  warningsHeader: {
    paddingBlock: {
      default: 6,
      [MOBILE]: 4,
    },
    paddingInline: {
      default: 12,
      [MOBILE]: 8,
    },
    fontSize: {
      default: 11,
      [MOBILE]: 10,
    },
    fontWeight: 600,
    color: "#92400e",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#fef3c7",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#fcd34d",
    position: "sticky",
    top: 0,
  },
  warningsList: {
    margin: 0,
    paddingBlock: 8,
    paddingInline: 12,
    listStyle: "none",
  },
  warningItem: {
    display: "flex",
    gap: 8,
    alignItems: "baseline",
    paddingBlock: {
      default: 4,
      [MOBILE]: 3,
    },
    paddingInline: 0,
    fontSize: {
      default: 11,
      [MOBILE]: 10,
    },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#fde68a",
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
    fontSize: 11,
  },

  // ── Render panel ──
  renderPanel: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
    display: "flex",
    flexDirection: "column",
    height: {
      default: 280,
      [MOBILE]: "auto",
    },
    minHeight: {
      default: null,
      [MOBILE]: 200,
    },
  },
  renderPanelFullHeight: {
    height: "auto",
    flex: 1,
    minHeight: 0,
  },
  renderPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: {
      default: 8,
      [MOBILE]: 5,
    },
    paddingInline: {
      default: 12,
      [MOBILE]: 8,
    },
    fontSize: {
      default: 11,
      [MOBILE]: 10,
    },
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e0e0e0",
  },
  renderPanelNote: {
    fontSize: {
      default: 11,
      [MOBILE]: 9,
    },
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
    flexDirection: {
      default: "row",
      [MOBILE]: "column",
    },
  },

  // ── Render panes ──
  renderPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRightWidth: {
      default: 1,
      [MOBILE]: 0,
    },
    borderRightStyle: {
      default: "solid",
      [MOBILE]: "none",
    },
    borderRightColor: {
      default: "#e0e0e0",
      [MOBILE]: null,
    },
    borderBottomWidth: {
      default: null,
      [MOBILE]: 1,
    },
    borderBottomStyle: {
      default: null,
      [MOBILE]: "solid",
    },
    borderBottomColor: {
      default: null,
      [MOBILE]: "#e0e0e0",
    },
    minWidth: 0,
    minHeight: {
      default: null,
      [MOBILE]: 120,
      [PHONE]: 100,
    },
  },
  renderPaneLast: {
    borderRightWidth: 0,
    borderRightStyle: "none",
  },
  renderPaneHeader: {
    paddingBlock: {
      default: 6,
      [MOBILE]: 4,
    },
    paddingInline: {
      default: 12,
      [MOBILE]: 8,
    },
    fontSize: {
      default: 11,
      [MOBILE]: 10,
    },
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: "#fafafa",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e0e0e0",
  },
  renderPaneBody: {
    flex: 1,
    padding: {
      default: 12,
      [MOBILE]: 8,
    },
    overflow: "auto",
    backgroundColor: "#fafafa",
  },
  renderPlaceholder: {
    fontSize: 11,
    color: "#888",
  },
  renderError: {
    color: "#c00",
    padding: 0,
    margin: 0,
    fontFamily: "monospace",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
});
