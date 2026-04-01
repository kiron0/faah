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
    excludePatterns: [
      "^\\[[^\\]]+\\s[0-9a-f]{7,40}\\]\\s(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\\([^)]+\\))?!?:\\s.+$",
    ],
  };
}

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("extension save order regression", () => {
  it("waits for persistence before refreshing status after a settings save", async () => {
    vi.resetModules();

    const statusUpdate = vi.fn();
    const persistDeferred = createDeferred<{
      skippedConfigurationKeys: string[];
    }>();
    const registerSettingsUiCommand = vi.fn((_context, _getStored, onSaved) => {
      return { dispose: vi.fn(), onSaved };
    });
    const persistStoredSettings = vi.fn(() => persistDeferred.promise);

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
        getConfiguration: vi.fn(() => ({ update: vi.fn() })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
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
      registerSettingsUiCommand,
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
    }));
    vi.doMock("../../src/terminal-shell-integration", () => ({
      getTerminalShellExecutionApi: vi.fn(() => null),
      isExecutionIdentity: vi.fn(() => false),
      isTerminalExecutionLike: vi.fn(() => false),
    }));

    const extension = await import("../../src/extension");
    const context = {
      subscriptions: [],
      globalState: { update: vi.fn().mockResolvedValue(undefined) },
      extensionUri: { fsPath: "/tmp/ext" },
    } as any;

    extension.activate(context);

    expect(statusUpdate).toHaveBeenCalled();
    statusUpdate.mockClear();

    const savedCall = registerSettingsUiCommand.mock.calls[0]?.[2];
    expect(typeof savedCall).toBe("function");

    const savePromise = savedCall?.(createStoredSettings(), "global");
    await Promise.resolve();

    expect(statusUpdate).not.toHaveBeenCalled();

    persistDeferred.resolve({ skippedConfigurationKeys: [] });
    await savePromise;

    expect(persistStoredSettings).toHaveBeenCalledTimes(1);
    expect(statusUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not surface onboarding storage failures as unhandled rejections", async () => {
    vi.resetModules();

    const statusUpdate = vi.fn();
    const showInformationMessage = vi.fn(async () => undefined);
    const registerSettingsUiCommand = vi.fn(() => ({
      dispose: vi.fn(),
    }));
    const persistStoredSettings = vi.fn(async () => ({
      skippedConfigurationKeys: [],
    }));
    const globalStateUpdate = vi
      .fn()
      .mockRejectedValue(new Error("storage unavailable"));

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: vi.fn(async () => undefined),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
        getConfiguration: vi.fn(() => ({ update: vi.fn() })),
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
      },
      window: {
        showInformationMessage,
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
      registerSettingsUiCommand,
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
    }));
    vi.doMock("../../src/terminal-shell-integration", () => ({
      getTerminalShellExecutionApi: vi.fn(() => null),
      isExecutionIdentity: vi.fn(() => false),
      isTerminalExecutionLike: vi.fn(() => false),
    }));

    const extension = await import("../../src/extension");
    const context = {
      subscriptions: [],
      globalState: {
        get: vi.fn(() => undefined),
        update: globalStateUpdate,
      },
      extensionUri: { fsPath: "/tmp/ext" },
    } as any;

    extension.activate(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(globalStateUpdate).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).not.toHaveBeenCalled();
  });
});
