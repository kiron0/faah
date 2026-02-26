import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeSettings } from "../../src/settings";

type FakeUri = {
  toString: () => string;
};

function createSettings(
  overrides: Partial<RuntimeSettings> = {},
): RuntimeSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    cooldownMs: 0,
    volumePercent: 70,
    patterns: [/error/i],
    excludePatterns: [],
    ...overrides,
  };
}

function createDiagnostic(
  message: string,
  severity = 0,
  line = 0,
): {
  code?: string;
  source?: string;
  message: string;
  severity: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
} {
  return {
    source: "ts",
    code: "TS1000",
    message,
    severity,
    range: {
      start: { line, character: 0 },
      end: { line, character: 5 },
    },
  };
}

async function loadDiagnosticsMonitorHarness() {
  vi.resetModules();

  const playAlert = vi.fn();
  const diagnosticsByUri = new Map<
    string,
    ReturnType<typeof createDiagnostic>[]
  >();
  const activeUri: FakeUri = { toString: () => "file:///active.ts" };
  const otherUri: FakeUri = { toString: () => "file:///other.ts" };

  const getDiagnostics = vi.fn(
    (uri: FakeUri) => diagnosticsByUri.get(uri.toString()) ?? [],
  );

  vi.doMock("vscode", () => ({
    window: {
      activeTextEditor: {
        document: { uri: activeUri },
      },
    },
    languages: {
      getDiagnostics,
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
    },
  }));
  vi.doMock("../../src/audio", () => ({ playAlert }));

  const diagnosticsMonitor = await import("../../src/diagnostics-monitor");

  return {
    diagnosticsMonitor,
    playAlert,
    diagnosticsByUri,
    activeUri,
    otherUri,
  };
}

describe("diagnostics monitor integration tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("plays alert once for unchanged active-file diagnostics and again after a new error", async () => {
    const harness = await loadDiagnosticsMonitorHarness();
    const settings = createSettings();
    const activeKey = harness.activeUri.toString();

    harness.diagnosticsByUri.set(activeKey, [
      createDiagnostic("initial error"),
    ]);

    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.wav",
    );
    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.wav",
    );

    expect(harness.playAlert).toHaveBeenCalledTimes(1);

    harness.diagnosticsByUri.set(activeKey, [
      createDiagnostic("updated error", 0, 10),
    ]);
    harness.diagnosticsMonitor.onDiagnosticsChanged(
      { uris: [harness.activeUri] } as any,
      () => settings,
      () => "media/faah.wav",
    );

    expect(harness.playAlert).toHaveBeenCalledTimes(2);
  });

  it("ignores diagnostics events for non-active files", async () => {
    const harness = await loadDiagnosticsMonitorHarness();
    const settings = createSettings();
    const activeKey = harness.activeUri.toString();
    const otherKey = harness.otherUri.toString();

    harness.diagnosticsByUri.set(activeKey, [createDiagnostic("active error")]);
    harness.diagnosticsByUri.set(otherKey, [createDiagnostic("other error")]);

    harness.diagnosticsMonitor.onDiagnosticsChanged(
      { uris: [harness.otherUri] } as any,
      () => settings,
      () => "media/faah.wav",
    );

    expect(harness.playAlert).not.toHaveBeenCalled();
  });

  it("does not play for warning-only diagnostics", async () => {
    const harness = await loadDiagnosticsMonitorHarness();
    const settings = createSettings();
    const activeKey = harness.activeUri.toString();

    harness.diagnosticsByUri.set(activeKey, [
      createDiagnostic("warning only", 1),
    ]);

    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.wav",
    );

    expect(harness.playAlert).not.toHaveBeenCalled();
  });

  it("plays for warning diagnostics when severity mode is warningAndError", async () => {
    const harness = await loadDiagnosticsMonitorHarness();
    const settings = createSettings({ diagnosticsSeverity: "warningAndError" });
    const activeKey = harness.activeUri.toString();

    harness.diagnosticsByUri.set(activeKey, [
      createDiagnostic("warning only", 1),
    ]);

    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.wav",
    );

    expect(harness.playAlert).toHaveBeenCalledTimes(1);
  });

  it("does not play for excluded diagnostic messages", async () => {
    const harness = await loadDiagnosticsMonitorHarness();
    const settings = createSettings({
      excludePatterns: [/^Type 'undefined' is not assignable/i],
    });
    const activeKey = harness.activeUri.toString();

    harness.diagnosticsByUri.set(activeKey, [
      createDiagnostic("Type 'undefined' is not assignable to type 'Item[]'."),
    ]);

    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.wav",
    );

    expect(harness.playAlert).not.toHaveBeenCalled();
  });
});
