import { describe, expect, it, vi } from "vitest";

import type { RuntimeSettings } from "../../src/settings";

type FakeUri = {
  toString: () => string;
};

function createSettings(overrides: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    cooldownMs: 1000,
    volumePercent: 70,
    patterns: [/error/i],
    excludePatterns: [],
    ...overrides,
  };
}

function createDiagnostic(message: string): {
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
    severity: 0,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    },
  };
}

async function loadMonitorHarness() {
  vi.resetModules();

  const playAlert = vi.fn();
  const activeUri: FakeUri = { toString: () => "file:///active.ts" };
  const diagnosticsByUri = new Map<string, ReturnType<typeof createDiagnostic>[]>();
  const getDiagnostics = vi.fn((uri: FakeUri) => diagnosticsByUri.get(uri.toString()) ?? []);

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

  const executionMonitor = await import("../../src/execution-monitor");
  const diagnosticsMonitor = await import("../../src/diagnostics-monitor");

  return {
    executionMonitor,
    diagnosticsMonitor,
    playAlert,
    diagnosticsByUri,
    activeUri,
  };
}

describe("monitor coordination integration tests", () => {
  it("shares cooldown across terminal and diagnostics without losing pending diagnostics alert", async () => {
    const harness = await loadMonitorHarness();
    const settings = createSettings();
    const activeKey = harness.activeUri.toString();

    let now = 1000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    harness.executionMonitor.tryPlayForExecution({} as any, settings, "media/faah.mp3");
    expect(harness.playAlert).toHaveBeenCalledTimes(1);

    harness.diagnosticsByUri.set(activeKey, [createDiagnostic("new diagnostic error")]);
    now = 1200;
    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.mp3",
    );
    expect(harness.playAlert).toHaveBeenCalledTimes(1);

    now = 2500;
    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.mp3",
    );
    expect(harness.playAlert).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it("prevents double playback when terminal and diagnostics fire in same cooldown window", async () => {
    const harness = await loadMonitorHarness();
    const settings = createSettings();
    const activeKey = harness.activeUri.toString();

    let now = 10_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    harness.diagnosticsByUri.set(activeKey, [createDiagnostic("new diagnostic error")]);
    harness.executionMonitor.tryPlayForExecution({} as any, settings, "media/faah.mp3");
    harness.diagnosticsMonitor.scanActiveEditorDiagnostics(
      () => settings,
      () => "media/faah.mp3",
    );

    expect(harness.playAlert).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });
});
