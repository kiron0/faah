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
    excludePresetIds: [],
    patterns: [/error/i],
    excludePatterns: [],
    ...overrides,
  };
}

async function loadStatusBarModule() {
  vi.resetModules();

  const statusBarItem = {
    text: "",
    tooltip: "",
    name: "",
    command: "",
    show: vi.fn(),
    dispose: vi.fn(),
  };

  vi.doMock("vscode", () => ({
    window: {
      createStatusBarItem: vi.fn(() => statusBarItem),
    },
    StatusBarAlignment: { Right: 2 },
  }));

  const statusBar = await import("../../src/status-bar");
  const controller = statusBar.createStatusBarController();

  return { controller, statusBarItem };
}

describe("status bar unit tests", () => {
  it("shows disabled text and tooltip when extension is disabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ enabled: false }));

    expect(statusBarItem.text).toBe("$(bell-slash) Faah Off");
    expect(statusBarItem.tooltip).toContain("Faah monitoring is disabled.");
  });

  it("shows standard T+E when both terminal and diagnostics are enabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ volumePercent: 80 }));

    expect(statusBarItem.text).toBe("$(bell) Faah T+E");
    expect(statusBarItem.tooltip).toContain("Sources: T+E");
  });

  it("shows T when only terminal monitoring is enabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(
      createSettings({ monitorTerminal: true, monitorDiagnostics: false }),
    );

    expect(statusBarItem.text).toBe("$(bell) Faah T");
    expect(statusBarItem.tooltip).toContain("Sources: T");
  });

  it("shows E when only diagnostics monitoring is enabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(
      createSettings({ monitorTerminal: false, monitorDiagnostics: true }),
    );

    expect(statusBarItem.text).toBe("$(bell) Faah E");
    expect(statusBarItem.tooltip).toContain("Sources: E");
  });

  it("shows None when both monitoring sources are disabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(
      createSettings({ monitorTerminal: false, monitorDiagnostics: false }),
    );

    expect(statusBarItem.text).toBe("$(bell) Faah None");
    expect(statusBarItem.tooltip).toContain("Sources: None");
  });

  it("shows snoozed indicator when snooze is active in minutes", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings(), { snoozeRemainingMs: 15 * 60_000 });

    expect(statusBarItem.text).toBe("$(bell-slash) Faah Snoozed");
    expect(statusBarItem.tooltip).toContain("Snooze remaining: 15m");
  });

  it("shows snoozed indicator in hours when snooze is >= 60 minutes", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings(), { snoozeRemainingMs: 120 * 60_000 });

    expect(statusBarItem.text).toBe("$(bell-slash) Faah Snoozed");
    expect(statusBarItem.tooltip).toContain("Snooze remaining: 2h");
  });

  it("displays warning badge when terminal monitoring is unsupported by host", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ monitorTerminal: true }), {
      terminalMonitoringCapability: "none",
    });

    expect(statusBarItem.text).toBe("$(bell) Faah E $(warning)");
    expect(statusBarItem.tooltip).toContain(
      "Terminal monitoring: unavailable in this editor version.",
    );
  });

  it("displays info badge when terminal monitoring has partial host support (outputOnly)", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ monitorTerminal: true }), {
      terminalMonitoringCapability: "outputOnly",
    });

    expect(statusBarItem.text).toBe("$(bell) Faah T+E $(info)");
    expect(statusBarItem.tooltip).toContain(
      "Terminal monitoring: partial host support. Output-stream alerts work, but exit-code monitoring is unavailable.",
    );
  });

  it("displays info badge when terminal monitoring has partial host support (exitCodeOnly)", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ monitorTerminal: true }), {
      terminalMonitoringCapability: "exitCodeOnly",
    });

    expect(statusBarItem.text).toBe("$(bell) Faah T+E $(info)");
    expect(statusBarItem.tooltip).toContain(
      "Terminal monitoring: partial host support. Exit-code alerts work, but output-stream monitoring is unavailable.",
    );
  });

  it("reflects quiet hours in tooltip when enabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(
      createSettings({
        quietHoursEnabled: true,
        quietHoursStart: "23:00",
        quietHoursEnd: "06:00",
      }),
    );

    expect(statusBarItem.tooltip).toContain("Quiet hours: 23:00 - 06:00");
  });

  it("reflects quiet hours as Off when disabled", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ quietHoursEnabled: false }));

    expect(statusBarItem.tooltip).toContain("Quiet hours: Off");
  });

  it("displays Error only in tooltip when diagnostics severity is default", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(createSettings({ diagnosticsSeverity: "error" }));

    expect(statusBarItem.tooltip).toContain("Diagnostics severity: Error only");
  });

  it("displays Error + Warning in tooltip when severity is warningAndError", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(
      createSettings({ diagnosticsSeverity: "warningAndError" }),
    );

    expect(statusBarItem.tooltip).toContain(
      "Diagnostics severity: Error + Warning",
    );
  });

  it("displays cooldowns in tooltip", async () => {
    const { controller, statusBarItem } = await loadStatusBarModule();

    controller.update(
      createSettings({ terminalCooldownMs: 2500, diagnosticsCooldownMs: 3000 }),
    );

    expect(statusBarItem.tooltip).toContain("Terminal cooldown: 2500ms");
    expect(statusBarItem.tooltip).toContain("Diagnostics cooldown: 3000ms");
  });
});
