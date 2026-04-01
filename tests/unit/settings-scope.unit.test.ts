import { describe, expect, it, vi } from "vitest";

async function loadSettingsModuleWithVscode(vscodeMock: unknown) {
  vi.resetModules();
  vi.doMock("vscode", () => vscodeMock);
  return import("../../src/settings");
}

describe("settings scope tests", () => {
  it("ignores language-scoped overrides that cannot be written back", async () => {
    const inspect = vi.fn((key: string) => {
      if (key === "showVisualNotifications") {
        return {
          key,
          globalValue: false,
          workspaceValue: false,
          workspaceFolderValue: false,
          globalLanguageValue: false,
          workspaceLanguageValue: false,
          workspaceFolderLanguageValue: true,
        };
      }
      return undefined;
    });

    const settings = await loadSettingsModuleWithVscode({
      workspace: {
        getConfiguration: vi.fn(() => ({
          inspect,
        })),
      },
    });

    const loaded = settings.loadStoredSettings({
      globalState: { get: vi.fn(() => undefined) },
    } as any);

    expect(loaded.showVisualNotifications).toBe(
      settings.defaultStoredSettings.showVisualNotifications,
    );
  });

  it("still reads workspace values when no language-scoped override is present", async () => {
    const inspect = vi.fn((key: string) => {
      if (key === "quietHoursEnabled") {
        return {
          key,
          globalValue: false,
          workspaceValue: true,
        };
      }
      return undefined;
    });

    const settings = await loadSettingsModuleWithVscode({
      workspace: {
        getConfiguration: vi.fn(() => ({
          inspect,
        })),
      },
    });

    const loaded = settings.loadStoredSettings({
      globalState: { get: vi.fn(() => undefined) },
    } as any);

    expect(loaded.quietHoursEnabled).toBe(true);
  });

  it("prefers workspace values even when a language-scoped override exists", async () => {
    const inspect = vi.fn((key: string) => {
      if (key === "quietHoursEnabled") {
        return {
          key,
          globalValue: false,
          workspaceValue: true,
          workspaceLanguageValue: false,
          workspaceFolderLanguageValue: true,
        };
      }
      return undefined;
    });

    const settings = await loadSettingsModuleWithVscode({
      workspace: {
        getConfiguration: vi.fn(() => ({
          inspect,
        })),
      },
    });

    const loaded = settings.loadStoredSettings({
      globalState: { get: vi.fn(() => undefined) },
    } as any);

    expect(loaded.quietHoursEnabled).toBe(true);
  });

  it("prefers workspace-folder values over workspace values", async () => {
    const inspect = vi.fn((key: string) => {
      if (key === "quietHoursEnabled") {
        return {
          key,
          globalValue: false,
          workspaceValue: true,
          workspaceFolderValue: false,
        };
      }
      return undefined;
    });

    const settings = await loadSettingsModuleWithVscode({
      workspace: {
        getConfiguration: vi.fn(() => ({
          inspect,
        })),
      },
    });

    const loaded = settings.loadStoredSettings({
      globalState: { get: vi.fn(() => undefined) },
    } as any);

    expect(loaded.quietHoursEnabled).toBe(false);
  });
});
