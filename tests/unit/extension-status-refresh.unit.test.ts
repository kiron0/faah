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
    excludePresetIds: [],
    patterns: ["\\berror\\b"],
    excludePatterns: [],
  };
}

async function activateExtension(options: { snoozeRemainingMs: () => number }) {
  vi.resetModules();

  const statusUpdate = vi.fn();
  let commandHandler: ((id: string, ...args: unknown[]) => unknown) | undefined;

  vi.doMock("vscode", () => ({
    commands: {
      registerCommand: vi.fn((id: string, cb: unknown) => {
        commandHandler = cb as never;
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
      showQuickPick: vi.fn(async () => undefined),
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
    notifySettingsPanelUpdated: vi.fn(),
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
    prewarmAudioBackend: vi.fn(),
    resetPrewarmState: vi.fn(),
  }));
  vi.doMock("../../src/alert-gate", () => ({
    clearSnoozeAlerts: vi.fn(),
    getSnoozeRemainingMs: vi.fn(() => options.snoozeRemainingMs()),
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
      showCliSetup: "faah.showCliSetup",
    },
  }));
  vi.doMock("../../src/diagnostics-monitor", () => ({
    disposeDiagnosticsMonitorState: vi.fn(),
    onDiagnosticsChanged: vi.fn(),
    scanActiveEditorDiagnostics: vi.fn(),
    clearDiagnosticsRetryTimers: vi.fn(),
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
  const context = {
    subscriptions: [],
    globalState: { get: vi.fn(() => undefined), update: vi.fn() },
    extensionUri: { fsPath: "/tmp/ext" },
  } as any;

  extension.activate(context);

  return {
    extension,
    statusUpdate,
    context,
    getCommandHandler: () => commandHandler,
  };
}

describe("status bar refresh timer", () => {
  it("stops the refresh loop once the snooze ends", async () => {
    vi.useFakeTimers();
    try {
      let remaining = 60_000;
      const { statusUpdate, getCommandHandler } = await activateExtension({
        snoozeRemainingMs: () => remaining,
      });

      // Snooze active: the refresh loop starts.
      const clearSnoozeHandler = getCommandHandler();
      expect(clearSnoozeHandler).toBeDefined();

      statusUpdate.mockClear();
      remaining = 30_000;
      vi.advanceTimersByTime(16_000);
      expect(statusUpdate.mock.calls.length).toBeGreaterThan(0);

      // Snooze expired: the loop must stop instead of ticking forever.
      remaining = 0;
      statusUpdate.mockClear();
      vi.advanceTimersByTime(60_000);
      const callsAfterExpiry = statusUpdate.mock.calls.length;
      expect(callsAfterExpiry).toBeGreaterThan(0);
      expect(callsAfterExpiry).toBeLessThanOrEqual(1);

      statusUpdate.mockClear();
      vi.advanceTimersByTime(120_000);
      expect(statusUpdate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
