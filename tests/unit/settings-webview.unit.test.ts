import { describe, expect, it, vi } from "vitest";

import type { StoredSettings } from "../../src/settings";

function createStoredSettings(enabled: boolean): StoredSettings {
  return {
    enabled,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    cooldownMs: 1500,
    terminalCooldownMs: 1500,
    diagnosticsCooldownMs: 1500,
    patternMode: "override",
    volumePercent: 70,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    patterns: ["\\berror\\b"],
    excludePatterns: ["^ignore this$"],
  };
}

describe("settings webview unit tests", () => {
  it("pushes updated settings to an open panel when faah configuration changes", async () => {
    vi.resetModules();

    let commandHandler: (() => Promise<void>) | undefined;
    let configChangeHandler:
      | ((event: { affectsConfiguration: (section: string) => boolean }) => void)
      | undefined;
    const postMessage = vi.fn();

    const panel = {
      webview: {
        html: "",
        cspSource: "vscode-webview",
        asWebviewUri: vi.fn((uri: unknown) => uri),
        postMessage,
        onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      iconPath: undefined as unknown,
    };

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand: vi.fn((_id: string, cb: () => Promise<void>) => {
          commandHandler = cb;
          return { dispose: vi.fn() };
        }),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
        onDidChangeConfiguration: vi.fn(
          (cb: (event: { affectsConfiguration: (section: string) => boolean }) => void) => {
            configChangeHandler = cb;
            return { dispose: vi.fn() };
          },
        ),
      },
      window: {
        createWebviewPanel: vi.fn(() => panel),
        showOpenDialog: vi.fn(async () => undefined),
      },
      Uri: {
        joinPath: vi.fn(() => ({ path: "/tmp/icon.png" })),
      },
      ViewColumn: {
        One: 1,
      },
      Disposable: {
        from: (...disposables: Array<{ dispose: () => void }>) => ({
          dispose: () => {
            disposables.forEach((disposable) => disposable.dispose());
          },
        }),
      },
    }));

    const settingsWebview = await import("../../src/settings-webview");
    let currentSettings = createStoredSettings(true);

    settingsWebview.registerSettingsUiCommand(
      { extensionUri: { fsPath: "/tmp/ext" } } as any,
      () => currentSettings,
      async () => undefined,
      () => undefined,
    );

    configChangeHandler?.({
      affectsConfiguration: (section: string) => section === "faah",
    });
    expect(postMessage).not.toHaveBeenCalled();

    await commandHandler?.();

    configChangeHandler?.({
      affectsConfiguration: (section: string) => section === "editor",
    });
    expect(postMessage).not.toHaveBeenCalled();

    currentSettings = createStoredSettings(false);
    configChangeHandler?.({
      affectsConfiguration: (section: string) => section === "faah",
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: "externalSettingsUpdated",
      payload: currentSettings,
    });
  });
});
