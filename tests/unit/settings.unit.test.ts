import { describe, expect, it, vi } from "vitest";

async function loadSettingsModule() {
  vi.resetModules();
  vi.doMock("vscode", () => ({}));
  return import("../../src/settings");
}

describe("settings unit tests", () => {
  it("normalizes undefined input to defaults", async () => {
    const settings = await loadSettingsModule();

    const normalized = settings.normalizeStoredSettings(undefined);

    expect(normalized).toEqual(settings.defaultStoredSettings);
  });

  it("clamps and sanitizes partial settings", async () => {
    const settings = await loadSettingsModule();

    const normalized = settings.normalizeStoredSettings({
      enabled: false,
      monitorTerminal: false,
      monitorDiagnostics: true,
      diagnosticsSeverity: "warningAndError",
      cooldownMs: 100,
      volumePercent: 999,
      patternMode: "append",
      patterns: ["   custom.*error   ", "   ", "", "panic"],
      excludePatterns: ["  ^ignore this$  ", "   "],
    });

    expect(normalized.enabled).toBe(false);
    expect(normalized.monitorTerminal).toBe(false);
    expect(normalized.monitorDiagnostics).toBe(true);
    expect(normalized.diagnosticsSeverity).toBe("warningAndError");
    expect(normalized.cooldownMs).toBe(500);
    expect(normalized.volumePercent).toBe(100);
    expect(normalized.patternMode).toBe("append");
    expect(normalized.patterns).toEqual(["custom.*error", "panic"]);
    expect(normalized.excludePatterns).toEqual(["^ignore this$"]);
  });

  it("falls back to override mode when pattern mode is invalid", async () => {
    const settings = await loadSettingsModule();

    const normalized = settings.normalizeStoredSettings({
      patternMode: "invalid-mode" as any,
    });

    expect(normalized.patternMode).toBe("override");
  });

  it("falls back to error severity mode when diagnostics severity is invalid", async () => {
    const settings = await loadSettingsModule();

    const normalized = settings.normalizeStoredSettings({
      diagnosticsSeverity: "invalid" as any,
    });

    expect(normalized.diagnosticsSeverity).toBe("error");
  });

  it("appends user patterns to defaults in append mode", async () => {
    const settings = await loadSettingsModule();

    const runtime = settings.toRuntimeSettings({
      ...settings.defaultStoredSettings,
      patternMode: "append",
      patterns: ["\\bmy_custom_error_token\\b"],
    });

    expect(runtime.patterns.length).toBe(settings.defaultStoredSettings.patterns.length + 1);
    expect(runtime.patterns.some((pattern) => pattern.test("my_custom_error_token"))).toBe(true);
    expect(runtime.excludePatterns.length).toBe(settings.defaultStoredSettings.excludePatterns.length);
  });

  it("falls back to default compiled patterns when override patterns are invalid", async () => {
    const settings = await loadSettingsModule();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const runtime = settings.toRuntimeSettings({
      ...settings.defaultStoredSettings,
      patternMode: "override",
      patterns: ["("],
    });

    expect(runtime.patterns.length).toBe(settings.defaultStoredSettings.patterns.length);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
