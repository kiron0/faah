import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings, StoredSettings } from "../../src/settings";

type Harness = {
  extension: typeof import("../../src/extension");
  context: {
    subscriptions: Array<{ dispose: () => void }>;
  };
  getStartHandler: () => ((event: { execution: unknown }) => void) | undefined;
  getEndHandler: () => ((event: { execution: unknown; exitCode?: number }) => void) | undefined;
  commandHandlers: Map<string, () => void>;
  mocks: {
    monitorExecutionOutput: ReturnType<typeof vi.fn>;
    tryPlayForExecution: ReturnType<typeof vi.fn>;
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
    cooldownMs: 1500,
    patternMode: "override",
    volumePercent: 70,
    patterns: ["\\berror\\b"],
  };
}

function createRuntimeSettings(stored: StoredSettings): RuntimeSettings {
  return {
    enabled: stored.enabled,
    cooldownMs: stored.cooldownMs,
    volumePercent: stored.volumePercent,
    patterns: [/error/i],
  };
}

async function loadExtensionHarness(enabled = true): Promise<Harness> {
  vi.resetModules();

  let startHandler: ((event: { execution: unknown }) => void) | undefined;
  let endHandler: ((event: { execution: unknown; exitCode?: number }) => void) | undefined;

  const commandHandlers = new Map<string, () => void>();
  const monitorExecutionOutput = vi.fn(async () => {});
  const tryPlayForExecution = vi.fn();
  const playAlert = vi.fn();
  const resolveSoundPath = vi.fn(() => "media/faah.mp3");
  const registerSettingsUiCommand = vi.fn(() => ({ dispose: vi.fn() }));

  const storedSettings = createStoredSettings(enabled);
  const runtimeSettings = createRuntimeSettings(storedSettings);

  const loadStoredSettings = vi.fn(() => storedSettings);
  const normalizeStoredSettings = vi.fn((next: StoredSettings) => next);
  const toRuntimeSettings = vi.fn((stored: StoredSettings) => createRuntimeSettings(stored));
  const persistStoredSettings = vi.fn(async () => {});

  const startDisposable = { dispose: vi.fn() };
  const endDisposable = { dispose: vi.fn() };
  const commandDisposable = { dispose: vi.fn() };
  const settingsDisposable = { dispose: vi.fn() };

  vi.doMock("vscode", () => ({
    window: {
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
    },
    commands: {
      registerCommand: vi.fn((id: string, cb: () => void) => {
        commandHandlers.set(id, cb);
        return commandDisposable;
      }),
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
  vi.doMock("../../src/settings-webview", () => ({
    registerSettingsUiCommand: vi.fn(
      (
        _context: unknown,
        _getStored: () => StoredSettings,
        _applySettings: (next: StoredSettings) => Promise<void>,
        _playTestSound: (next: StoredSettings) => void,
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
    commandHandlers,
    mocks: {
      monitorExecutionOutput,
      tryPlayForExecution,
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
  it("wires commands and terminal listeners on activate", async () => {
    const harness = await loadExtensionHarness(true);
    harness.extension.activate(harness.context as any);
    const startHandler = harness.getStartHandler();
    const endHandler = harness.getEndHandler();

    expect(harness.context.subscriptions).toHaveLength(4);
    expect(startHandler).toBeTypeOf("function");
    expect(endHandler).toBeTypeOf("function");
    expect(harness.commandHandlers.has("terminalErrorSound.playTestSound")).toBe(true);

    const execution = {};
    startHandler?.({ execution });
    expect(harness.mocks.monitorExecutionOutput).toHaveBeenCalledTimes(1);

    endHandler?.({ execution, exitCode: 1 });
    expect(harness.mocks.tryPlayForExecution).toHaveBeenCalledWith(
      execution,
      harness.runtimeSettings,
      harness.soundPath,
    );

    const testCommand = harness.commandHandlers.get("terminalErrorSound.playTestSound");
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
});
