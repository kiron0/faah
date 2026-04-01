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
    customSoundPath: "./sounds/custom.wav",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    patterns: ["\\berror\\b"],
    excludePatterns: [],
  };
}

describe("extension sound path regression", () => {
  it("refreshes the resolved custom sound path when workspace folders change", async () => {
    vi.resetModules();

    let workspaceFoldersHandler:
      | (() => void)
      | undefined;
    const playAlert = vi.fn();
    const resolvedPaths = [
      "/workspace-a/sounds/custom.wav",
      "/workspace-b/sounds/custom.wav",
    ];
    const resolveSoundPath = vi.fn(() => resolvedPaths.shift() ?? "");
    const commandHandlers = new Map<string, () => void>();

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand: vi.fn((id: string, cb: () => void) => {
          commandHandlers.set(id, cb);
          return { dispose: vi.fn() };
        }),
        executeCommand: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/workspace-a" } }],
        getConfiguration: vi.fn(() => ({ update: vi.fn() })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeWorkspaceFolders: vi.fn((cb: () => void) => {
          workspaceFoldersHandler = cb;
          return { dispose: vi.fn() };
        }),
      },
      window: {
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
        update: vi.fn(),
      })),
    }));
    vi.doMock("../../src/audio", () => ({
      playAlert,
      resolveSoundPath,
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

    const playTestSound = commandHandlers.get("faah.playTestSound");
    playTestSound?.();
    expect(playAlert).toHaveBeenCalledWith(
      expect.any(Object),
      "/workspace-a/sounds/custom.wav",
    );

    workspaceFoldersHandler?.();

    playTestSound?.();
    expect(playAlert).toHaveBeenLastCalledWith(
      expect.any(Object),
      "/workspace-b/sounds/custom.wav",
    );
    expect(resolveSoundPath).toHaveBeenCalledTimes(2);
  });
});
