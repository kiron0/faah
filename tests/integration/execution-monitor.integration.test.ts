import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings } from "../../src/settings";

type FakeExecution = {
  read: () => AsyncGenerator<string, void, unknown>;
};

function createExecution(chunks: string[]): FakeExecution {
  return {
    read: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createSettings(
  overrides: Partial<RuntimeSettings> = {},
): RuntimeSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    terminalDetectionMode: "either",
    cooldownMs: 0,
    terminalCooldownMs: 0,
    diagnosticsCooldownMs: 0,
    volumePercent: 70,
    showVisualNotifications: false,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    excludePresetIds: ["conventionalCommits"],
    patterns: [/error/i],
    excludePatterns: [
      /^\[[^\]]+\s[0-9a-f]{7,40}\]\s(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]+\))?!?:\s.+$/i,
    ],
    ...overrides,
  };
}

async function loadExecutionMonitor() {
  vi.resetModules();
  const playAlert = vi.fn();

  vi.doMock("vscode", () => ({ window: { showWarningMessage: vi.fn() } }));
  vi.doMock("../../src/audio", () => ({ playAlert }));
  const executionMonitor = await import("../../src/execution-monitor");

  return { executionMonitor, playAlert };
}

describe("execution monitor integration tests", () => {
  it("plays alert once when error text spans chunk boundaries", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution(["build ERR", "OR happened\n"]) as any;
    const settings = createSettings();

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).toHaveBeenCalledTimes(1);
    expect(playAlert).toHaveBeenCalledWith(settings, "media/faah.wav");
  });

  it("plays alert when final stream line has no trailing newline", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution(["build failed: error happened"]) as any;
    const settings = createSettings();

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).toHaveBeenCalledTimes(1);
    expect(playAlert).toHaveBeenCalledWith(settings, "media/faah.wav");
  });

  it("does not play alert when monitoring is disabled", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution(["error happened\n"]) as any;
    const settings = createSettings({ enabled: false });

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).not.toHaveBeenCalled();
  });

  it("does not play when terminal source monitoring is disabled", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution(["error happened\n"]) as any;
    const settings = createSettings({ monitorTerminal: false });

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).not.toHaveBeenCalled();
  });

  it("skips output-triggered alerts when terminal detection mode is exit-code only", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution(["error happened\n"]) as any;
    const settings = createSettings({ terminalDetectionMode: "exitCode" });

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).not.toHaveBeenCalled();
  });

  it("ignores benign commit summary lines that only contain the word error", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution([
      "[main abcdef1] feat: now handle active file error\n",
    ]) as any;
    const settings = createSettings();

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).not.toHaveBeenCalled();
  });

  it("still plays for real terminal errors", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution([
      "error: command failed with exit code 1\n",
    ]) as any;
    const settings = createSettings();

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate playback for the same execution", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution([]) as any;
    const settings = createSettings();

    executionMonitor.tryPlayForExecution(execution, settings, "media/faah.wav");
    executionMonitor.tryPlayForExecution(execution, settings, "media/faah.wav");

    expect(playAlert).toHaveBeenCalledTimes(1);
  });

  it("skips exit-code-triggered alerts when terminal detection mode is output only", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution([]) as any;
    const settings = createSettings({ terminalDetectionMode: "output" });

    executionMonitor.tryPlayForExecution(execution, settings, "media/faah.wav");

    expect(playAlert).not.toHaveBeenCalled();
  });

  it("allows the same execution to alert again after the monitor state is reset", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const execution = createExecution(["error happened\n"]) as any;
    const settings = createSettings();

    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );
    executionMonitor.resetExecutionMonitorState();
    await executionMonitor.monitorExecutionOutput(
      execution,
      () => settings,
      () => "media/faah.wav",
    );

    expect(playAlert).toHaveBeenCalledTimes(2);
  });

  it("catches stream read errors without throwing", async () => {
    const { executionMonitor, playAlert } = await loadExecutionMonitor();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const execution = {
      read: () => {
        throw new Error("stream failed");
      },
    } as any;
    const settings = createSettings();

    await expect(
      executionMonitor.monitorExecutionOutput(
        execution,
        () => settings,
        () => "media/faah.wav",
      ),
    ).resolves.toBeUndefined();

    expect(playAlert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to read terminal shell execution stream: stream failed",
      ),
    );
  });
});
