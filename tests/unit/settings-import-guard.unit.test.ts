import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const tempFiles: string[] = [];

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

function createSettingsFile(content: string): string {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "faah-import-")),
    "settings.json",
  );
  tempFiles.push(file);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

async function registerPanel(receiveHandler: {
  current?: (message: unknown) => Promise<void>;
}) {
  vi.resetModules();

  const postMessage = vi.fn();
  let commandHandler: (() => Promise<void>) | undefined;
  let receive:
    | ((message: {
        type: string;
        payload?: unknown;
        target?: string;
      }) => Promise<void>)
    | undefined;

  const panel = {
    webview: {
      html: "",
      cspSource: "vscode-webview",
      asWebviewUri: vi.fn((uri: unknown) => uri),
      postMessage,
      onDidReceiveMessage: vi.fn((cb: typeof receive) => {
        receive = cb;
        receiveHandler.current = cb as never;
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

  const onSaved = vi.fn(async () => ({ skippedConfigurationKeys: [] }));

  settingsWebview.registerSettingsUiCommand(
    {
      extensionUri: { fsPath: "/tmp/ext" },
      globalState: {
        get: vi.fn(() => undefined),
        update: vi.fn(async () => undefined),
      },
    } as any,
    () =>
      ({
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
        patterns: [],
        excludePatterns: [],
      }) as never,
    onSaved,
    () => undefined,
    "full",
  );

  await commandHandler?.();

  return { postMessage, onSaved, receive };
}

describe("settings import guards", () => {
  it("rejects oversized settings files without saving", async () => {
    const hugeFile = createSettingsFile(
      JSON.stringify({ patterns: ["a".repeat(2 * 1024 * 1024)] }),
    );

    const harness = await registerPanel({});

    // Point the open dialog at the oversized file.
    const vscode = (await import("vscode")) as unknown as {
      window: { showOpenDialog: ReturnType<typeof vi.fn> };
    };
    vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([
      { fsPath: hugeFile } as never,
    ]);

    await harness.receive?.({ type: "importSettings", target: "global" });

    expect(harness.onSaved).not.toHaveBeenCalled();
    expect(harness.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("imports a valid settings file", async () => {
    const validFile = createSettingsFile(
      JSON.stringify({ volumePercent: 33, patterns: ["\\berror\\b"] }),
    );

    const harness = await registerPanel({});

    const vscode = (await import("vscode")) as unknown as {
      window: { showOpenDialog: ReturnType<typeof vi.fn> };
    };
    vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([
      { fsPath: validFile } as never,
    ]);

    await harness.receive?.({ type: "importSettings", target: "global" });

    expect(harness.onSaved).toHaveBeenCalledTimes(1);
    expect(harness.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "saved" }),
    );
  });
});
