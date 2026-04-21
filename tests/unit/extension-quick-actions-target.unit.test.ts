import { describe, expect, it, vi } from "vitest";

import type { StoredSettings } from "../../src/settings";

function createStoredSettings(): StoredSettings {
  return {
    enabled: true,
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
    excludePatterns: [],
  };
}

describe("extension quick action persistence", () => {
  it("uses the remembered save target for quick actions", async () => {
    vi.resetModules();

    const commandHandlers = new Map<string, () => void>();
    const showQuickPick = vi.fn(async () => ({
      label: "Disable Faah",
      description: "Master monitoring switch",
      action: "toggleEnabled",
    }));
    const persistStoredSettings = vi.fn(async () => ({
      skippedConfigurationKeys: [],
    }));
    const statusUpdate = vi.fn();

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand: vi.fn((id: string, cb: () => void) => {
          commandHandlers.set(id, cb);
          return { dispose: vi.fn() };
        }),
        executeCommand: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
        getConfiguration: vi.fn(() => ({
          inspect: vi.fn(() => undefined),
          update: vi.fn(),
        })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
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
        showQuickPick,
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
      StatusBarAlignment: {
        Right: 2,
      },
    }));

    vi.doMock("../../src/settings-webview", () => ({
      registerSettingsUiCommand: vi.fn(() => ({ dispose: vi.fn() })),
      saveTargetStorageKey: "faah.settings.saveTarget.v1",
    }));
    vi.doMock("../../src/settings", () => ({
      loadStoredSettings: vi.fn(() => createStoredSettings()),
      normalizeStoredSettings: vi.fn((settings: StoredSettings) => settings),
      persistStoredSettings,
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
      prewarmAudioBackend: vi.fn(),
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
      disposeDiagnosticsMonitorState: vi.fn(),
      onDiagnosticsChanged: vi.fn(),
      scanActiveEditorDiagnostics: vi.fn(),
    }));
    vi.doMock("../../src/execution-monitor", () => ({
      monitorExecutionOutput: vi.fn(),
      tryPlayForExecution: vi.fn(),
      resetExecutionMonitorState: vi.fn(),
    }));
    vi.doMock("../../src/terminal-shell-integration", () => ({
      getEffectiveTerminalMonitoringCapability: vi.fn(
        (capability: string) => capability,
      ),
      getTerminalMonitoringCapability: vi.fn(() => "none"),
      getTerminalShellExecutionApi: vi.fn(() => null),
      isExecutionIdentity: vi.fn(() => false),
      isTerminalExecutionLike: vi.fn(() => false),
    }));

    const extension = await import("../../src/extension");
    extension.activate({
      subscriptions: [],
      extensionUri: { fsPath: "/tmp/ext" },
      globalState: {
        get: vi.fn(() => "workspace"),
        update: vi.fn().mockResolvedValue(undefined),
      },
    } as any);

    await commandHandlers.get("faah.showQuickActions")?.();

    expect(persistStoredSettings).toHaveBeenCalledTimes(1);
    expect(persistStoredSettings.mock.calls[0][2]).toBe("workspace");
  });
});
