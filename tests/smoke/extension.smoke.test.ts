import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings, StoredSettings } from "../../src/settings";

type Harness = {
  extension: typeof import("../../src/extension");
  context: {
    subscriptions: Array<{ dispose: () => void }>;
  };
  statusBarItem: {
    text: string;
    tooltip: string;
    name: string;
    command: string;
    show: ReturnType<typeof vi.fn>;
    dispose: () => void;
  };
  getStartHandler: () => ((event: { execution: unknown }) => void) | undefined;
  getEndHandler: () =>
    | ((event: { execution: unknown; exitCode?: number }) => void)
    | undefined;
  getActiveEditorHandler: () => (() => void) | undefined;
  getTextDocumentHandler: () =>
    | ((event: {
        document: { uri: { toString: () => string } };
        contentChanges: unknown[];
      }) => void)
    | undefined;
  getDiagnosticsHandler: () =>
    | ((event: { uris: unknown[] }) => void)
    | undefined;
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
    terminalDetectionMode: "either",
    cooldownMs: 1500,
    terminalCooldownMs: 1500,
    diagnosticsCooldownMs: 1500,
    patternMode: "override",
    volumePercent: 70,
    showVisualNotifications: false,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    excludePresetIds: ["conventionalCommits"],
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
    terminalDetectionMode: stored.terminalDetectionMode,
    cooldownMs: stored.cooldownMs,
    terminalCooldownMs: stored.terminalCooldownMs,
    diagnosticsCooldownMs: stored.diagnosticsCooldownMs,
    volumePercent: stored.volumePercent,
    showVisualNotifications: stored.showVisualNotifications,
    customSoundPath: stored.customSoundPath,
    quietHoursEnabled: stored.quietHoursEnabled,
    quietHoursStart: stored.quietHoursStart,
    quietHoursEnd: stored.quietHoursEnd,
    excludePresetIds: stored.excludePresetIds,
    patterns: [/error/i],
    excludePatterns: [
      /^\[[^\]]+\s[0-9a-f]{7,40}\]\s(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]+\))?!?:\s.+$/i,
    ],
  };
}

async function loadExtensionHarness(
  enabled = true,
  supportsTerminalShellExecution = true,
): Promise<Harness> {
  vi.resetModules();

  let startHandler: ((event: { execution: unknown }) => void) | undefined;
  let endHandler:
    | ((event: { execution: unknown; exitCode?: number }) => void)
    | undefined;
  let activeEditorHandler: (() => void) | undefined;
  let textDocumentHandler:
    | ((event: {
        document: { uri: { toString: () => string } };
        contentChanges: unknown[];
      }) => void)
    | undefined;
  let diagnosticsHandler: ((event: { uris: unknown[] }) => void) | undefined;
  const activeUri = { toString: () => "file:///active.ts" };

  const commandHandlers = new Map<string, () => void>();
  const monitorExecutionOutput = vi.fn(async () => {});
  const tryPlayForExecution = vi.fn();
  const onDiagnosticsChanged = vi.fn();
  const scanActiveEditorDiagnostics = vi.fn();
  const playAlert = vi.fn();
  const resolveSoundPath = vi.fn(() => "media/faah.wav");
  const registerSettingsUiCommand = vi.fn(() => ({ dispose: vi.fn() }));
  const executeCommand = vi.fn(async () => {});

  const storedSettings = createStoredSettings(enabled);
  const runtimeSettings = createRuntimeSettings(storedSettings);

  const loadStoredSettings = vi.fn(() => storedSettings);
  const normalizeStoredSettings = vi.fn((next: StoredSettings) => next);
  const toRuntimeSettings = vi.fn((stored: StoredSettings) =>
    createRuntimeSettings(stored),
  );
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
      ...(supportsTerminalShellExecution
        ? {
            onDidStartTerminalShellExecution: vi.fn(
              (cb: (event: { execution: unknown }) => void) => {
                startHandler = cb;
                return startDisposable;
              },
            ),
            onDidEndTerminalShellExecution: vi.fn(
              (
                cb: (event: { execution: unknown; exitCode?: number }) => void,
              ) => {
                endHandler = cb;
                return endDisposable;
              },
            ),
          }
        : {}),
      onDidChangeActiveTextEditor: vi.fn((cb: () => void) => {
        activeEditorHandler = cb;
        return activeEditorDisposable;
      }),
      createStatusBarItem: vi.fn(() => statusBarItem),
      showQuickPick: vi.fn(async () => undefined),
      showInformationMessage: vi.fn(async () => undefined),
      showInputBox: vi.fn(async () => undefined),
    },
    workspace: {
      onDidChangeTextDocument: vi.fn(
        (
          cb: (event: {
            document: { uri: { toString: () => string } };
            contentChanges: unknown[];
          }) => void,
        ) => {
          textDocumentHandler = cb;
          return { dispose: vi.fn() };
        },
      ),
      onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    },
    languages: {
      onDidChangeDiagnostics: vi.fn(
        (cb: (event: { uris: unknown[] }) => void) => {
          diagnosticsHandler = cb;
          return diagnosticsDisposable;
        },
      ),
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
    prewarmAudioBackend: vi.fn(),
  }));
  vi.doMock("../../src/execution-monitor", () => ({
    monitorExecutionOutput,
    tryPlayForExecution,
  }));
  vi.doMock("../../src/diagnostics-monitor", () => ({
    onDiagnosticsChanged,
    scanActiveEditorDiagnostics,
    disposeDiagnosticsMonitorState: vi.fn(),
  }));
  vi.doMock("../../src/settings-webview", () => ({
    registerSettingsUiCommand: registerSettingsUiCommand.mockImplementation(
      (
        _context: unknown,
        _getStored: () => StoredSettings,
        _applySettings: (next: StoredSettings) => Promise<void>,
        _playTestSound: (next: StoredSettings) => void,
        _terminalMonitoringCapability: string,
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
    extension: {
      packageJSON: {
        version: "0.1.8",
      },
    },
    globalState: {
      get: vi.fn(() => undefined),
      update: vi.fn(async () => undefined),
    },
  };

  return {
    extension,
    context,
    statusBarItem,
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
    soundPath: "media/faah.wav",
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

    expect(harness.context.subscriptions).toHaveLength(17);
    expect(startHandler).toBeTypeOf("function");
    expect(endHandler).toBeTypeOf("function");
    expect(activeEditorHandler).toBeTypeOf("function");
    expect(textDocumentHandler).toBeTypeOf("function");
    expect(diagnosticsHandler).toBeTypeOf("function");
    expect(harness.commandHandlers.has("faah.playTestSound")).toBe(true);
    expect(harness.commandHandlers.has("faah.showCompatibilityStatus")).toBe(
      true,
    );
    expect(harness.commandHandlers.has("faah.showQuickActions")).toBe(true);
    expect(harness.commandHandlers.has("faah.openSettingsUI")).toBe(false);
    expect(harness.commandHandlers.has("faah.snoozeAlerts")).toBe(true);
    expect(harness.commandHandlers.has("faah.clearSnooze")).toBe(true);
    expect(harness.commandHandlers.has("faah.setQuietHours")).toBe(true);
    expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(1);

    const execution = {
      read: async function* () {},
    };
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

    const execution = {
      read: async function* () {},
    };
    startHandler?.({ execution });
    endHandler?.({ execution, exitCode: 1 });

    expect(harness.mocks.monitorExecutionOutput).not.toHaveBeenCalled();
    expect(harness.mocks.tryPlayForExecution).not.toHaveBeenCalled();
  });

  it("keeps diagnostics active when terminal shell integration is unavailable", async () => {
    const harness = await loadExtensionHarness(true, false);
    harness.extension.activate(harness.context as any);
    const activeEditorHandler = harness.getActiveEditorHandler();
    const textDocumentHandler = harness.getTextDocumentHandler();
    const diagnosticsHandler = harness.getDiagnosticsHandler();

    expect(harness.context.subscriptions).toHaveLength(15);
    expect(harness.getStartHandler()).toBeUndefined();
    expect(harness.getEndHandler()).toBeUndefined();
    expect(activeEditorHandler).toBeTypeOf("function");
    expect(textDocumentHandler).toBeTypeOf("function");
    expect(diagnosticsHandler).toBeTypeOf("function");
    expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(1);
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
      expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(
        1,
      );

      vi.runAllTimers();
      expect(harness.mocks.scanActiveEditorDiagnostics).toHaveBeenCalledTimes(
        2,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps quick actions on the status bar even if settings UI registration fails", async () => {
    vi.resetModules();

    const statusBarItem = {
      text: "",
      tooltip: "",
      name: "",
      command: "",
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.doMock("vscode", () => ({
      window: {
        createStatusBarItem: vi.fn(() => statusBarItem),
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
        getConfiguration: vi.fn(() => ({
          inspect: vi.fn(() => undefined),
          update: vi.fn(),
        })),
      },
      env: {
        appName: "VS Code",
      },
      version: "1.0.0",
      StatusBarAlignment: {
        Right: 2,
      },
    }));

    vi.doMock("../../src/audio", () => ({
      playAlert: vi.fn(),
      resolveSoundPath: vi.fn(() => "media/faah.wav"),
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("../../src/execution-monitor", () => ({
      monitorExecutionOutput: vi.fn(),
      tryPlayForExecution: vi.fn(),
      resetExecutionMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/diagnostics-monitor", () => ({
      onDiagnosticsChanged: vi.fn(),
      scanActiveEditorDiagnostics: vi.fn(),
      disposeDiagnosticsMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/settings-webview", () => ({
      registerSettingsUiCommand: vi.fn(() => {
        throw new Error("settings ui failed");
      }),
      saveTargetStorageKey: "faah.settings.saveTarget.v1",
    }));
    vi.doMock("../../src/settings", () => ({
      loadStoredSettings: vi.fn(() => createStoredSettings(true)),
      normalizeStoredSettings: vi.fn((next: StoredSettings) => next),
      persistStoredSettings: vi.fn(async () => undefined),
      toRuntimeSettings: vi.fn((stored: StoredSettings) =>
        createRuntimeSettings(stored),
      ),
    }));

    const extension = await import("../../src/extension");
    extension.activate({
      subscriptions: [],
      extension: { packageJSON: { version: "0.1.8" } },
      globalState: {
        get: vi.fn(() => undefined),
        update: vi.fn(async () => undefined),
      },
    } as any);

    expect(statusBarItem.command).toBe("faah.showQuickActions");
    expect(statusBarItem.show).toHaveBeenCalledTimes(1);
  });

  it("reports current detection mode incompatibility in compatibility status", async () => {
    vi.resetModules();

    const commandHandlers = new Map<string, () => void>();
    const showWarningMessage = vi.fn(async () => undefined);
    const storedSettings = {
      ...createStoredSettings(true),
      terminalDetectionMode: "exitCode" as const,
    };
    const statusBarItem = {
      text: "",
      tooltip: "",
      name: "",
      command: "",
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.doMock("vscode", () => ({
      window: {
        activeTextEditor: undefined,
        onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
        createStatusBarItem: vi.fn(() => statusBarItem),
        showQuickPick: vi.fn(async () => undefined),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage,
        showInputBox: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration: vi.fn(() => ({
          inspect: vi.fn(() => undefined),
          update: vi.fn(async () => undefined),
        })),
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
        getWorkspaceFolder: vi.fn(() => undefined),
      },
      languages: {
        onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
      },
      commands: {
        registerCommand: vi.fn((id: string, cb: () => void) => {
          commandHandlers.set(id, cb);
          return { dispose: vi.fn() };
        }),
        executeCommand: vi.fn(async () => undefined),
      },
      env: {
        appName: "VS Code",
      },
      version: "1.0.0",
      StatusBarAlignment: {
        Right: 2,
      },
    }));

    vi.doMock("../../src/audio", () => ({
      playAlert: vi.fn(),
      resolveSoundPath: vi.fn(() => "media/faah.wav"),
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("../../src/execution-monitor", () => ({
      monitorExecutionOutput: vi.fn(),
      tryPlayForExecution: vi.fn(),
      resetExecutionMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/diagnostics-monitor", () => ({
      onDiagnosticsChanged: vi.fn(),
      scanActiveEditorDiagnostics: vi.fn(),
      disposeDiagnosticsMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/settings-webview", () => ({
      registerSettingsUiCommand: vi.fn(() => ({ dispose: vi.fn() })),
      saveTargetStorageKey: "faah.settings.saveTarget.v1",
    }));
    vi.doMock("../../src/settings", () => ({
      loadStoredSettings: vi.fn(() => storedSettings),
      normalizeStoredSettings: vi.fn((next: StoredSettings) => next),
      persistStoredSettings: vi.fn(async () => undefined),
      toRuntimeSettings: vi.fn((stored: StoredSettings) =>
        createRuntimeSettings(stored),
      ),
    }));

    const extension = await import("../../src/extension");
    extension.activate({
      subscriptions: [],
      extension: { packageJSON: { version: "0.2.0" } },
      globalState: {
        get: vi.fn(() => "0.2.0"),
        update: vi.fn(async () => undefined),
      },
    } as any);

    commandHandlers.get("faah.showCompatibilityStatus")?.();

    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("current Terminal Detection Mode"),
    );
  });

  it("blocks enabling terminal monitoring when current detection mode is unsupported", async () => {
    vi.resetModules();

    const commandHandlers = new Map<string, () => Promise<void> | void>();
    const showWarningMessage = vi.fn(async () => undefined);
    const persistStoredSettings = vi.fn(async () => undefined);
    const shownQuickPickItems: Array<{ label: string; action: string }> = [];
    const storedSettings = {
      ...createStoredSettings(true),
      monitorTerminal: false,
      terminalDetectionMode: "exitCode" as const,
    };
    const statusBarItem = {
      text: "",
      tooltip: "",
      name: "",
      command: "",
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.doMock("vscode", () => ({
      window: {
        activeTextEditor: undefined,
        onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
        createStatusBarItem: vi.fn(() => statusBarItem),
        showQuickPick: vi.fn(
          async (items: Array<{ label: string; action: string }>) => {
            shownQuickPickItems.push(...items);
            return items.find((item) => item.action === "toggleTerminal");
          },
        ),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage,
        showInputBox: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration: vi.fn(() => ({
          inspect: vi.fn(() => undefined),
          update: vi.fn(async () => undefined),
        })),
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
        getWorkspaceFolder: vi.fn(() => undefined),
      },
      languages: {
        onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
      },
      commands: {
        registerCommand: vi.fn((id: string, cb: () => Promise<void> | void) => {
          commandHandlers.set(id, cb);
          return { dispose: vi.fn() };
        }),
        executeCommand: vi.fn(async () => undefined),
      },
      env: {
        appName: "VS Code",
      },
      version: "1.0.0",
      StatusBarAlignment: {
        Right: 2,
      },
    }));

    vi.doMock("../../src/audio", () => ({
      playAlert: vi.fn(),
      resolveSoundPath: vi.fn(() => "media/faah.wav"),
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("../../src/execution-monitor", () => ({
      monitorExecutionOutput: vi.fn(),
      tryPlayForExecution: vi.fn(),
      resetExecutionMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/diagnostics-monitor", () => ({
      onDiagnosticsChanged: vi.fn(),
      scanActiveEditorDiagnostics: vi.fn(),
      disposeDiagnosticsMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/settings-webview", () => ({
      registerSettingsUiCommand: vi.fn(() => ({ dispose: vi.fn() })),
      saveTargetStorageKey: "faah.settings.saveTarget.v1",
    }));
    vi.doMock("../../src/settings", () => ({
      loadStoredSettings: vi.fn(() => storedSettings),
      normalizeStoredSettings: vi.fn((next: StoredSettings) => next),
      persistStoredSettings,
      toRuntimeSettings: vi.fn((stored: StoredSettings) =>
        createRuntimeSettings(stored),
      ),
    }));

    const extension = await import("../../src/extension");
    extension.activate({
      subscriptions: [],
      extension: { packageJSON: { version: "0.2.0" } },
      globalState: {
        get: vi.fn(() => "0.2.0"),
        update: vi.fn(async () => undefined),
      },
    } as any);

    await commandHandlers.get("faah.showQuickActions")?.();

    expect(shownQuickPickItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Terminal Monitoring Unsupported for Current Mode",
        }),
      ]),
    );
    expect(showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("current Terminal Detection Mode"),
    );
    expect(persistStoredSettings).not.toHaveBeenCalled();
  });

  it("onboarding reflects unsupported current detection mode", async () => {
    vi.resetModules();

    const showInformationMessage = vi.fn(async () => undefined);
    const storedSettings = {
      ...createStoredSettings(true),
      terminalDetectionMode: "exitCode" as const,
    };
    const statusBarItem = {
      text: "",
      tooltip: "",
      name: "",
      command: "",
      show: vi.fn(),
      dispose: vi.fn(),
    };

    vi.doMock("vscode", () => ({
      window: {
        activeTextEditor: undefined,
        onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
        createStatusBarItem: vi.fn(() => statusBarItem),
        showQuickPick: vi.fn(async () => undefined),
        showInformationMessage,
        showWarningMessage: vi.fn(async () => undefined),
        showInputBox: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration: vi.fn(() => ({
          inspect: vi.fn(() => undefined),
          update: vi.fn(async () => undefined),
        })),
        onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
        getWorkspaceFolder: vi.fn(() => undefined),
      },
      languages: {
        onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
      },
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      env: {
        appName: "VS Code",
      },
      version: "1.0.0",
      StatusBarAlignment: {
        Right: 2,
      },
    }));

    vi.doMock("../../src/audio", () => ({
      playAlert: vi.fn(),
      resolveSoundPath: vi.fn(() => "media/faah.wav"),
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("../../src/execution-monitor", () => ({
      monitorExecutionOutput: vi.fn(),
      tryPlayForExecution: vi.fn(),
      resetExecutionMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/diagnostics-monitor", () => ({
      onDiagnosticsChanged: vi.fn(),
      scanActiveEditorDiagnostics: vi.fn(),
      disposeDiagnosticsMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/settings-webview", () => ({
      registerSettingsUiCommand: vi.fn(() => ({ dispose: vi.fn() })),
      saveTargetStorageKey: "faah.settings.saveTarget.v1",
    }));
    vi.doMock("../../src/settings", () => ({
      loadStoredSettings: vi.fn(() => storedSettings),
      normalizeStoredSettings: vi.fn((next: StoredSettings) => next),
      persistStoredSettings: vi.fn(async () => undefined),
      toRuntimeSettings: vi.fn((stored: StoredSettings) =>
        createRuntimeSettings(stored),
      ),
    }));

    const extension = await import("../../src/extension");
    extension.activate({
      subscriptions: [],
      extension: { packageJSON: { version: "0.2.0" } },
      globalState: {
        get: vi.fn(() => undefined),
        update: vi.fn(async () => undefined),
      },
    } as any);

    await Promise.resolve();
    await Promise.resolve();

    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("current Terminal Detection Mode"),
      "Open Settings",
      "Play Test Sound",
      "Show Compatibility",
    );
  });
});
