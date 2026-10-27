import { describe, expect, it, vi } from "vitest";

import type { StoredSettings } from "../../src/settings";

type InspectEntry = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
  defaultValue?: unknown;
};

function createStoredSettings(
  overrides: Partial<StoredSettings> = {},
): StoredSettings {
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
    ...overrides,
  };
}

async function loadSettingsModule(
  options: {
    stored?: Partial<StoredSettings>;
    inspect?: Record<string, InspectEntry>;
    updates?: Array<[string, unknown]>;
  } = {},
) {
  vi.resetModules();

  const stored = options.stored;
  const inspectTable = options.inspect ?? {};
  const updates = options.updates ?? [];

  vi.doMock("vscode", () => ({
    workspace: {
      getConfiguration: vi.fn(() => ({
        inspect: (key: string) => inspectTable[key] ?? {},
        update: vi.fn(async (key: string, value: unknown) => {
          updates.push([key, value]);
        }),
      })),
      workspaceFolders: undefined,
    },
    window: { showWarningMessage: vi.fn() },
    ConfigurationTarget: { Global: "global", Workspace: "workspace" },
  }));

  const settingsModule = await import("../../src/settings");

  const context = {
    globalState: {
      get: vi.fn(() => stored),
      update: vi.fn(async () => undefined),
    },
  } as any;

  return { settingsModule, context, updates };
}

describe("settings configuration override handling", () => {
  it("keeps the stored value when the configuration write was rejected", async () => {
    const { settingsModule, context } = await loadSettingsModule({
      stored: createStoredSettings({ volumePercent: 42 }),
      inspect: {
        volumePercent: { globalValue: 70 },
      },
    });

    const loaded = settingsModule.loadStoredSettings(context, [
      "volumePercent",
    ]);

    expect(loaded.volumePercent).toBe(42);
  });

  it("uses the configuration value when the key was not rejected", async () => {
    const { settingsModule, context } = await loadSettingsModule({
      stored: createStoredSettings({ volumePercent: 42 }),
      inspect: {
        volumePercent: { globalValue: 70 },
      },
    });

    const loaded = settingsModule.loadStoredSettings(context, []);

    expect(loaded.volumePercent).toBe(70);
  });

  it("prefers workspace folder values over global values", async () => {
    const { settingsModule, context } = await loadSettingsModule({
      stored: createStoredSettings({ diagnosticsSeverity: "error" }),
      inspect: {
        diagnosticsSeverity: {
          globalValue: "error",
          workspaceValue: "warningAndError",
        },
      },
    });

    const loaded = settingsModule.loadStoredSettings(context, []);

    expect(loaded.diagnosticsSeverity).toBe("warningAndError");
  });

  it("does not write the shared cooldown key back to the configuration", async () => {
    const updates: Array<[string, unknown]> = [];
    const { settingsModule, context } = await loadSettingsModule({ updates });

    await settingsModule.persistStoredSettings(
      context,
      createStoredSettings({ cooldownMs: 9000 }),
      "global",
    );

    expect(updates.some(([key]) => key === "cooldownMs")).toBe(false);
    expect(updates.some(([key]) => key === "terminalCooldownMs")).toBe(true);
  });
});
