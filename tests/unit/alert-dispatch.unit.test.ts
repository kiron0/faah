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
    cooldownMs: 1500,
    terminalCooldownMs: 1500,
    diagnosticsCooldownMs: 1500,
    volumePercent: 70,
    showVisualNotifications: false,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
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

    vi.doMock("../../src/audio", () => ({ playAlert }));
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

    vi.doMock("../../src/audio", () => ({ playAlert }));
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
});
