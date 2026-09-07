import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings } from "../../src/settings";

function createSettings(
  overrides: Partial<RuntimeSettings> = {},
): RuntimeSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    terminalDetectionMode: "either",
    cooldownMs: 1500,
    terminalCooldownMs: 1500,
    diagnosticsCooldownMs: 1500,
    volumePercent: 70,
    showVisualNotifications: false,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    excludePresetIds: ["conventionalCommits"],
    patterns: [/error/i],
    excludePatterns: [],
    ...overrides,
  };
}

describe("alert dispatch unit tests", () => {
  it("plays audio and shows no popup when visual notifications are disabled", async () => {
    vi.resetModules();
    const playAlert = vi.fn();
    const showWarningMessage = vi.fn();

    vi.doMock("../../src/audio", () => ({
      playAlert,
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("vscode", () => ({ window: { showWarningMessage } }));

    const dispatch = await import("../../src/alert-dispatch");

    dispatch.triggerAlert("terminal", createSettings(), "media/faah.wav");

    expect(playAlert).toHaveBeenCalledTimes(1);
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it("shows a visual popup when visual notifications are enabled", async () => {
    vi.resetModules();
    const playAlert = vi.fn();
    const showWarningMessage = vi.fn();

    vi.doMock("../../src/audio", () => ({
      playAlert,
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("vscode", () => ({ window: { showWarningMessage } }));

    const dispatch = await import("../../src/alert-dispatch");

    dispatch.triggerAlert(
      "diagnostics",
      createSettings({ showVisualNotifications: true }),
      "media/faah.wav",
    );

    expect(playAlert).toHaveBeenCalledTimes(1);
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Faah detected editor diagnostics.",
    );
  });

  it("shows the correct message for terminal errors", async () => {
    vi.resetModules();
    const playAlert = vi.fn();
    const showWarningMessage = vi.fn();

    vi.doMock("../../src/audio", () => ({
      playAlert,
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("vscode", () => ({ window: { showWarningMessage } }));

    const dispatch = await import("../../src/alert-dispatch");

    dispatch.triggerAlert(
      "terminal",
      createSettings({ showVisualNotifications: true }),
      "media/faah.wav",
    );

    expect(showWarningMessage).toHaveBeenCalledWith(
      "Faah detected terminal error output.",
    );
  });

  it("throttles consecutive visual alerts within 1200ms window", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const playAlert = vi.fn();
      const showWarningMessage = vi.fn();

      vi.doMock("../../src/audio", () => ({
        playAlert,
        prewarmAudioBackend: vi.fn(),
      }));
      vi.doMock("vscode", () => ({ window: { showWarningMessage } }));

      const dispatch = await import("../../src/alert-dispatch");
      const settings = createSettings({ showVisualNotifications: true });

      dispatch.triggerAlert("terminal", settings, "media/faah.wav");
      expect(showWarningMessage).toHaveBeenCalledTimes(1);

      // Trigger again immediately
      dispatch.triggerAlert("terminal", settings, "media/faah.wav");
      expect(showWarningMessage).toHaveBeenCalledTimes(1); // Throttled!

      // Advance past 1200ms
      vi.advanceTimersByTime(1250);
      dispatch.triggerAlert("terminal", settings, "media/faah.wav");
      expect(showWarningMessage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throttles visual alerts per-source independently", async () => {
    vi.resetModules();
    const playAlert = vi.fn();
    const showWarningMessage = vi.fn();

    vi.doMock("../../src/audio", () => ({
      playAlert,
      prewarmAudioBackend: vi.fn(),
    }));
    vi.doMock("vscode", () => ({ window: { showWarningMessage } }));

    const dispatch = await import("../../src/alert-dispatch");
    const settings = createSettings({ showVisualNotifications: true });

    // Terminal triggers first
    dispatch.triggerAlert("terminal", settings, "media/faah.wav");
    expect(showWarningMessage).toHaveBeenCalledTimes(1);

    // Diagnostics triggers immediately after -> not blocked by terminal throttle
    dispatch.triggerAlert("diagnostics", settings, "media/faah.wav");
    expect(showWarningMessage).toHaveBeenCalledTimes(2);
  });
});
