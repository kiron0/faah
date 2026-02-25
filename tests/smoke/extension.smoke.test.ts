import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings, StoredSettings } from "../../src/settings";

type Harness = {
  extension: typeof import("../../src/extension");
  context: {
    subscriptions: Array<{ dispose: () => void }>;
  };
  getStartHandler: () => ((event: { execution: unknown }) => void) | undefined;
  getEndHandler: () => ((event: { execution: unknown; exitCode?: number }) => void) | undefined;
  getActiveEditorHandler: () => (() => void) | undefined;
  getTextDocumentHandler: () =>
    | ((event: { document: { uri: { toString: () => string } }; contentChanges: unknown[] }) => void)
    | undefined;
  getDiagnosticsHandler: () => ((event: { uris: unknown[] }) => void) | undefined;
  commandHandlers: Map<string, () => void>;
  mocks: {
    monitorExecutionOutput: ReturnType<typeof vi.fn>;
    tryPlayForExecution: ReturnType<typeof vi.fn>;
    onDiagnosticsChanged: ReturnType<typeof vi.fn>;
    scanActiveEditorDiagnostics: ReturnType<typeof vi.fn>;
    executeCommand: ReturnType<typeof vi.fn>;
    playAlert: ReturnType<typeof vi.fn>;
    registerSettingsUiCommand: ReturnType<typeof vi.fn>;
    persistStoredSettings: ReturnType<typeof vi.fn>;
    toRuntimeSettings: ReturnType<typeof vi.fn>;
  };
  storedSettings: StoredSettings;
  runtimeSettings: RuntimeSettings;
  soundPath: string;
};

function createStoredSettings(enabled: boolean): StoredSettings {
  return {
    enabled,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    cooldownMs: 1500,
    patternMode: "override",
    volumePercent: 70,
    patterns: ["\\berror\\b"],
    excludePatterns: [
      "^\\[[^\\]]+\\s[0-9a-f]{7,40}\\]\\s(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\\([^)]+\\))?!?:\\s.+$",
    ],
  };
}

function createRuntimeSettings(stored: StoredSettings): RuntimeSettings {
  return {
    enabled: stored.enabled,
    monitorTerminal: stored.monitorTerminal,
    monitorDiagnostics: stored.monitorDiagnostics,
    diagnosticsSeverity: stored.diagnosticsSeverity,
    cooldownMs: stored.cooldownMs,
    volumePercent: stored.volumePercent,
    patterns: [/error/i],
    excludePatterns: [/^\[[^\]]+\s[0-9a-f]{7,40}\]\s(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]+\))?!?:\s.+$/i],
  };
}

async function loadExtensionHarness(enabled = true): Promise<Harness> {
  vi.resetModules();

  let startHandler: ((event: { execution: unknown }) => void) | undefined;
  let endHandler: ((event: { execution: unknown; exitCode?: number }) => void) | undefined;
  let activeEditorHandler: (() => void) | undefined;
  let textDocumentHandler:
    | ((event: { document: { uri: { toString: () => string } }; contentChanges: unknown[] }) => void)
    | undefined;
  let diagnosticsHandler: ((event: { uris: unknown[] }) => void) | undefined;
  const activeUri = { toString: () => "file:///active.ts" };

  const commandHandlers = new Map<string, () => void>();
  const monitorExecutionOutput = vi.fn(async () => {});
  const tryPlayForExecution = vi.fn();
  const onDiagnosticsChanged = vi.fn();
  const scanActiveEditorDiagnostics = vi.fn();
  const playAlert = vi.fn();
  const resolveSoundPath = vi.fn(() => "media/faah.mp3");
  const registerSettingsUiCommand = vi.fn(() => ({ dispose: vi.fn() }));
  const executeCommand = vi.fn(async () => {});

  const storedSettings = createStoredSettings(enabled);
  const runtimeSettings = createRuntimeSettings(storedSettings);

  const loadStoredSettings = vi.fn(() => storedSettings);
  const normalizeStoredSettings = vi.fn((next: StoredSettings) => next);
  const toRuntimeSettings = vi.fn((stored: StoredSettings) => createRuntimeSettings(stored));
  const persistStoredSettings = vi.fn(async () => {});

  const startDisposable = { dispose: vi.fn() };
  const endDisposable = { dispose: vi.fn() };
  const activeEditorDisposable = { dispose: vi.fn() };
  const diagnosticsDisposable = { dispose: vi.fn() };
  const commandDisposable = { dispose: vi.fn() };
  const settingsDisposable = { dispose: vi.fn() };
  const statusBarDisposable = { dispose: vi.fn() };
  const statusBarItem = {
    text: "",
    tooltip: "",
    name: "",
    command: "",
    show: vi.fn(),
    dispose: statusBarDisposable.dispose,
  };

  vi.doMock("vscode", () => ({
    window: {
      activeTextEditor: {
        document: { uri: activeUri },
      },
      onDidStartTerminalShellExecution: vi.fn((cb: (event: { execution: unknown }) => void) => {
        startHandler = cb;
        return startDisposable;
      }),
      onDidEndTerminalShellExecution: vi.fn(
        (cb: (event: { execution: unknown; exitCode?: number }) => void) => {
          endHandler = cb;
          return endDisposable;
        },
      ),
      onDidChangeActiveTextEditor: vi.fn((cb: () => void) => {
        activeEditorHandler = cb;
        return activeEditorDisposable;
      }),
      createStatusBarItem: vi.fn(() => statusBarItem),
      showQuickPick: vi.fn(async () => undefined),
    },
    workspace: {
      onDidChangeTextDocument: vi.fn(
        (cb: (event: { document: { uri: { toString: () => string } }; contentChanges: unknown[] }) => void) => {
          textDocumentHandler = cb;
          return { dispose: vi.fn() };
        },
      ),
    },
    languages: {
      onDidChangeDiagnostics: vi.fn((cb: (event: { uris: unknown[] }) => void) => {
        diagnosticsHandler = cb;
        return diagnosticsDisposable;
      }),
    },
    commands: {
      registerCommand: vi.fn((id: string, cb: () => void) => {
        commandHandlers.set(id, cb);
        return commandDisposable;
      }),
      executeCommand,
    },
    StatusBarAlignment: {
      Right: 2,
    },
  }));

  vi.doMock("../../src/audio", () => ({
    playAlert,
    resolveSoundPath,
  }));
  vi.doMock("../../src/execution-monitor", () => ({
    monitorExecutionOutput,
    tryPlayForExecution,
  }));
  vi.doMock("../../src/diagnostics-monitor", () => ({
    onDiagnosticsChanged,
    scanActiveEditorDiagnostics,
  }));
  vi.doMock("../../src/settings-webview", () => ({
    registerSettingsUiCommand: registerSettingsUiCommand.mockImplementation(
      (
        _context: unknown,
        _getStored: () => StoredSettings,
        _applySettings: (next: StoredSettings) => Promise<void>,
        _playTestSound: (next: StoredSettings) => void,
        _commandId: string,
      ) => settingsDisposable,
    ),
  }));
  vi.doMock("../../src/settings", () => ({
    loadStoredSettings,
    normalizeStoredSettings,
    persistStoredSettings,
    toRuntimeSettings,
  }));

  const extension = await import("../../src/extension");
  const context = {
    subscriptions: [] as Array<{ dispose: () => void }>,
  };

  return {
    extension,
    context,
    getStartHandler: () => startHandler,
    getEndHandler: () => endHandler,
    getActiveEditorHandler: () => activeEditorHandler,
    getTextDocumentHandler: () => textDocumentHandler,
    getDiagnosticsHandler: () => diagnosticsHandler,
    commandHandlers,
    mocks: {
      monitorExecutionOutput,
      tryPlayForExecution,
      onDiagnosticsChanged,
      scanActiveEditorDiagnostics,
      executeCommand,
      playAlert,
      registerSettingsUiCommand,
      persistStoredSettings,
      toRuntimeSettings,
    },
    storedSettings,
    runtimeSettings,
    soundPath: "media/faah.mp3",
  };
}

describe("extension smoke tests", () => {
  it("wires terminal and diagnostics listeners on activate", async () => {
    const harness = await loadExtensionHarness(true);
    harness.extension.activate(harness.context as any);
    const startHandler = harness.getStartHandler();
    const endHandler = harness.getEndHandler();
    const activeEditorHandler = harness.getActiveEditorHandler();
    const textDocumentHandler = harness.getTextDocumentHandler();
    const diagnosticsHandler = harness.getDiagnosticsHandler();

    expect(harness.context.subscriptions).toHaveLength(10);
    expect(startHandler).toBeTypeOf("function");
    expect(endHandler).toBeTypeOf("function");
    expect(activeEditorHandler).toBeTypeOf("function");
    expect(textDocumentHandler).toBeTypeOf("function");
    expect(diagnosticsHandler).toBeTypeOf("function");
    expect(harness.commandHandlers.has("faah.playTestSound")).toBe(true);
    expect(harness.commandHandlers.has("faah.showQuickActions")).toBe(true);
    expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(1);

    const execution = {};
    startHandler?.({ execution });
    expect(harness.mocks.monitorExecutionOutput).toHaveBeenCalledTimes(1);

    endHandler?.({ execution, exitCode: 1 });
    expect(harness.mocks.tryPlayForExecution).toHaveBeenCalledWith(
      execution,
      harness.runtimeSettings,
      harness.soundPath,
    );

    diagnosticsHandler?.({ uris: [{}] });
    expect(harness.mocks.onDiagnosticsChanged).toHaveBeenCalledTimes(1);

    activeEditorHandler?.();
    expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(2);

    const testCommand = harness.commandHandlers.get("faah.playTestSound");
    testCommand?.();
    expect(harness.mocks.playAlert).toHaveBeenCalledWith(
      harness.runtimeSettings,
      harness.soundPath,
    );
  });

  it("skips listener playback paths when feature is disabled", async () => {
    const harness = await loadExtensionHarness(false);
    harness.extension.activate(harness.context as any);
    const startHandler = harness.getStartHandler();
    const endHandler = harness.getEndHandler();

    const execution = {};
    startHandler?.({ execution });
    endHandler?.({ execution, exitCode: 1 });

    expect(harness.mocks.monitorExecutionOutput).not.toHaveBeenCalled();
    expect(harness.mocks.tryPlayForExecution).not.toHaveBeenCalled();
  });

  it("debounces diagnostics while typing in active editor", async () => {
    vi.useFakeTimers();
    try {
      const harness = await loadExtensionHarness(true);
      harness.extension.activate(harness.context as any);
      const textDocumentHandler = harness.getTextDocumentHandler();
      const diagnosticsHandler = harness.getDiagnosticsHandler();
      const activeUri = { toString: () => "file:///active.ts" };

      textDocumentHandler?.({
        document: { uri: activeUri },
        contentChanges: [{ text: "x" }],
      });
      diagnosticsHandler?.({ uris: [activeUri] });

      expect(harness.mocks.onDiagnosticsChanged).not.toHaveBeenCalled();
      expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(1);

      vi.runAllTimers();
      expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
