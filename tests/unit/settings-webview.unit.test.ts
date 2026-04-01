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
    showVisualNotifications: false,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    patterns: ["\\berror\\b"],
    excludePatterns: ["^ignore this$"],
  };
}

describe("settings webview unit tests", () => {
  it("restores the last successful save target when reopening the panel", async () => {
    vi.resetModules();

    let commandHandler: (() => Promise<void>) | undefined;
    let receiveHandler:
      | ((message: {
          type: string;
          payload?: unknown;
          target?: string;
          presetId?: string;
        }) => Promise<void>)
      | undefined;
    const postMessage = vi.fn();
    let rememberedTarget: "global" | "workspace" = "global";
    const globalStateGet = vi.fn(() => rememberedTarget);
    const globalStateUpdate = vi.fn(async (_key: string, value: string) => {
      rememberedTarget = value === "workspace" ? "workspace" : "global";
    });

    const panel = {
      webview: {
        html: "",
        cspSource: "vscode-webview",
        asWebviewUri: vi.fn((uri: unknown) => uri),
        postMessage,
        onDidReceiveMessage: vi.fn((cb: typeof receiveHandler) => {
          receiveHandler = cb;
          return { dispose: vi.fn() };
        }),
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
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
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

    settingsWebview.registerSettingsUiCommand(
      {
        extensionUri: { fsPath: "/tmp/ext" },
        globalState: {
          get: globalStateGet,
          update: globalStateUpdate,
        },
      } as any,
      () => createStoredSettings(true),
      async () => undefined,
      () => undefined,
      true,
    );

    await commandHandler?.();

    expect(panel.webview.html).toContain(
      '<option value="global" selected>User (Global)</option>',
    );
    expect(panel.webview.html).toContain(
      '<option value="workspace">Workspace</option>',
    );

    await receiveHandler?.({
      type: "save",
      payload: createStoredSettings(true),
      target: "workspace",
    });

    expect(globalStateUpdate).toHaveBeenCalledWith(
      expect.any(String),
      "workspace",
    );

    await commandHandler?.();

    expect(panel.webview.html).toContain(
      '<option value="workspace" selected>Workspace</option>',
    );
  });

  it("recomputes workspace availability when reopening the panel", async () => {
    vi.resetModules();

    let commandHandler: (() => Promise<void>) | undefined;
    let workspaceFolders: Array<{ uri: { fsPath: string } }> = [];
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
        get workspaceFolders() {
          return workspaceFolders;
        },
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
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

    settingsWebview.registerSettingsUiCommand(
      {
        extensionUri: { fsPath: "/tmp/ext" },
        globalState: {
          get: vi.fn(() => "workspace"),
          update: vi.fn().mockResolvedValue(undefined),
        },
      } as any,
      () => createStoredSettings(true),
      async () => undefined,
      () => undefined,
      true,
    );

    await commandHandler?.();
    expect(panel.webview.html).toContain(
      '<option value="workspace" disabled>Workspace</option>',
    );

    workspaceFolders = [{ uri: { fsPath: "/tmp/workspace" } }];
    await commandHandler?.();

    expect(panel.webview.html).toContain(
      '<option value="workspace" selected>Workspace</option>',
    );
  });

  it("notifies an open panel when workspace availability changes", async () => {
    vi.resetModules();

    let commandHandler: (() => Promise<void>) | undefined;
    let workspaceFoldersHandler: (() => void) | undefined;
    let workspaceFolders: Array<{ uri: { fsPath: string } }> = [];
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
        get workspaceFolders() {
          return workspaceFolders;
        },
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
        onDidChangeWorkspaceFolders: vi.fn((cb: () => void) => {
          workspaceFoldersHandler = cb;
          return { dispose: vi.fn() };
        }),
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

    settingsWebview.registerSettingsUiCommand(
      {
        extensionUri: { fsPath: "/tmp/ext" },
        globalState: {
          get: vi.fn(() => "global"),
          update: vi.fn().mockResolvedValue(undefined),
        },
      } as any,
      () => createStoredSettings(true),
      async () => undefined,
      () => undefined,
      true,
    );

    await commandHandler?.();
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "workspaceFoldersUpdated" }),
    );

    workspaceFolders = [{ uri: { fsPath: "/tmp/workspace" } }];
    workspaceFoldersHandler?.();

    expect(postMessage).toHaveBeenCalledWith({
      type: "workspaceFoldersUpdated",
      hasWorkspace: true,
    });
  });

  it("pushes updated settings to an open panel when faah configuration changes", async () => {
    vi.resetModules();

    let commandHandler: (() => Promise<void>) | undefined;
    let configChangeHandler:
      | ((event: {
          affectsConfiguration: (section: string) => boolean;
        }) => void)
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
      true,
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

  it("forwards skipped configuration keys so the webview can warn the user", async () => {
    vi.resetModules();

    let commandHandler: (() => Promise<void>) | undefined;
    let receiveHandler:
      | ((message: {
          type: string;
          payload?: unknown;
          target?: string;
        }) => Promise<void>)
      | undefined;
    const postMessage = vi.fn();
    const onSaved = vi.fn(async () => ({
      skippedConfigurationKeys: ["faah.showVisualNotifications"],
    }));

    const panel = {
      webview: {
        html: "",
        cspSource: "vscode-webview",
        asWebviewUri: vi.fn((uri: unknown) => uri),
        postMessage,
        onDidReceiveMessage: vi.fn((cb: typeof receiveHandler) => {
          receiveHandler = cb;
          return { dispose: vi.fn() };
        }),
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
        onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
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

    settingsWebview.registerSettingsUiCommand(
      { extensionUri: { fsPath: "/tmp/ext" } } as any,
      () => createStoredSettings(true),
      onSaved,
      () => undefined,
      true,
    );

    await commandHandler?.();
    await receiveHandler?.({
      type: "save",
      payload: createStoredSettings(true),
      target: "global",
    });

    expect(onSaved).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: "saved",
      payload: createStoredSettings(true),
      target: "global",
      skippedConfigurationKeys: ["faah.showVisualNotifications"],
    });
  });
});
