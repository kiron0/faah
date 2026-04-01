import { describe, expect, it, vi } from "vitest";

import type { StoredSettings } from "../../src/settings";

function createStoredSettings(): StoredSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
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
    patterns: ["\\berror\\b"],
    excludePatterns: [],
  };
}

describe("extension monitor reset regression", () => {
  it("resets diagnostics and terminal caches when relevant configuration changes", async () => {
    vi.resetModules();

    const scanActiveEditorDiagnostics = vi.fn();
    const disposeDiagnosticsMonitorState = vi.fn();
    const resetExecutionMonitorState = vi.fn();
    const statusUpdate = vi.fn();
    let configChangeHandler:
      | ((event: {
          affectsConfiguration: (section: string) => boolean;
        }) => void)
      | undefined;

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
        getConfiguration: vi.fn(() => ({
          inspect: vi.fn(() => undefined),
          update: vi.fn(),
        })),
        onDidChangeConfiguration: vi.fn(
          (
            cb: (event: {
              affectsConfiguration: (section: string) => boolean;
            }) => void,
          ) => {
            configChangeHandler = cb;
            return { dispose: vi.fn() };
          },
        ),
      },
      window: {
        createStatusBarItem: vi.fn(() => ({
          name: "",
          command: "",
          text: "",
          tooltip: "",
          show: vi.fn(),
          dispose: vi.fn(),
        })),
        showInformationMessage: vi.fn(async () => undefined),
        showWarningMessage: vi.fn(async () => undefined),
      },
      env: {
        appName: "VS Code",
      },
      version: "1.0.0",
      Uri: {
        joinPath: vi.fn(() => ({ fsPath: "/tmp/icon.png" })),
      },
      Disposable: {
        from: (...disposables: Array<{ dispose: () => void }>) => ({
          dispose: () => {
            disposables.forEach((disposable) => disposable.dispose());
          },
        }),
      },
      ConfigurationTarget: {
        Global: "global",
        Workspace: "workspace",
      },
    }));

    vi.doMock("../../src/settings-webview", () => ({
      registerSettingsUiCommand: vi.fn(() => ({ dispose: vi.fn() })),
    }));
    vi.doMock("../../src/settings", () => ({
      loadStoredSettings: vi.fn(() => createStoredSettings()),
      normalizeStoredSettings: vi.fn((settings: StoredSettings) => settings),
      persistStoredSettings: vi.fn(async () => ({
        skippedConfigurationKeys: [],
      })),
      toRuntimeSettings: vi.fn((settings: StoredSettings) => settings),
      defaultStoredSettings: createStoredSettings(),
      isValidQuietHoursTime: vi.fn(() => true),
    }));
    vi.doMock("../../src/status-bar", () => ({
      createStatusBarController: vi.fn(() => ({
        item: { dispose: vi.fn() },
        update: statusUpdate,
      })),
    }));
    vi.doMock("../../src/audio", () => ({
      playAlert: vi.fn(),
      resolveSoundPath: vi.fn(() => "media/faah.wav"),
    }));
    vi.doMock("../../src/alert-gate", () => ({
      clearSnoozeAlerts: vi.fn(),
      getSnoozeRemainingMs: vi.fn(() => 0),
      snoozeAlertsForMs: vi.fn(),
    }));
    vi.doMock("../../src/commands", () => ({
      commandIds: {
        showQuickActions: "faah.showQuickActions",
        openSettingsUi: "faah.openSettingsUI",
        playTestSound: "faah.playTestSound",
        showCompatibilityStatus: "faah.showCompatibilityStatus",
        snoozeAlerts: "faah.snoozeAlerts",
        clearSnooze: "faah.clearSnooze",
        setQuietHours: "faah.setQuietHours",
      },
    }));
    vi.doMock("../../src/diagnostics-monitor", () => ({
      disposeDiagnosticsMonitorState,
      onDiagnosticsChanged: vi.fn(),
      scanActiveEditorDiagnostics,
    }));
    vi.doMock("../../src/execution-monitor", () => ({
      monitorExecutionOutput: vi.fn(),
      resetExecutionMonitorState,
      tryPlayForExecution: vi.fn(),
    }));
    vi.doMock("../../src/terminal-shell-integration", () => ({
      getTerminalShellExecutionApi: vi.fn(() => null),
      isExecutionIdentity: vi.fn(() => false),
      isTerminalExecutionLike: vi.fn(() => false),
    }));

    const extension = await import("../../src/extension");
    extension.activate({
      subscriptions: [],
      globalState: {
        get: vi.fn(() => undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
      extensionUri: { fsPath: "/tmp/ext" },
    } as any);

    scanActiveEditorDiagnostics.mockClear();
    disposeDiagnosticsMonitorState.mockClear();
    resetExecutionMonitorState.mockClear();

    configChangeHandler?.({
      affectsConfiguration: (section: string) =>
        section === "faah" || section === "faah.patterns",
    });

    expect(resetExecutionMonitorState).toHaveBeenCalledTimes(1);
    expect(disposeDiagnosticsMonitorState).toHaveBeenCalledTimes(1);
    expect(scanActiveEditorDiagnostics).toHaveBeenCalledTimes(1);
    expect(statusUpdate).toHaveBeenCalled();
  });
});
