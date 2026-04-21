import { describe, expect, it, vi } from "vitest";

async function loadTerminalShellIntegrationModule() {
  vi.resetModules();
  vi.doMock("vscode", () => ({
    window: {},
  }));
  return import("../../src/terminal-shell-integration");
}

describe("terminal shell integration unit tests", () => {
  it("detects supported shell execution events from the host window", async () => {
    const integration = await loadTerminalShellIntegrationModule();
    const start = vi.fn();
    const end = vi.fn();

    const api = integration.getTerminalShellExecutionApi({
      onDidStartTerminalShellExecution: start,
      onDidEndTerminalShellExecution: end,
    });

    expect(api).not.toBeNull();
    expect(api?.onDidStartTerminalShellExecution).toBe(start);
    expect(api?.onDidEndTerminalShellExecution).toBe(end);
    expect(
      integration.getTerminalMonitoringCapability({
        onDidStartTerminalShellExecution: start,
        onDidEndTerminalShellExecution: end,
      }),
    ).toBe("full");
  });

  it("reports exit-code-only capability when only end terminal shell execution event exists", async () => {
    const integration = await loadTerminalShellIntegrationModule();
    const end = vi.fn();

    const api = integration.getTerminalShellExecutionApi({
      onDidEndTerminalShellExecution: end,
    });

    expect(api).not.toBeNull();
    expect(api?.onDidStartTerminalShellExecution).toBeUndefined();
    expect(api?.onDidEndTerminalShellExecution).toBe(end);
    expect(
      integration.getTerminalMonitoringCapability({
        onDidEndTerminalShellExecution: end,
      }),
    ).toBe("exitCodeOnly");
  });

  it("reports output-only capability when only start terminal shell execution event exists", async () => {
    const integration = await loadTerminalShellIntegrationModule();
    const start = vi.fn();

    const api = integration.getTerminalShellExecutionApi({
      onDidStartTerminalShellExecution: start,
    });

    expect(api).not.toBeNull();
    expect(api?.onDidStartTerminalShellExecution).toBe(start);
    expect(api?.onDidEndTerminalShellExecution).toBeUndefined();
    expect(
      integration.getTerminalMonitoringCapability({
        onDidStartTerminalShellExecution: start,
      }),
    ).toBe("outputOnly");
  });

  it("returns null when the host lacks shell execution events", async () => {
    const integration = await loadTerminalShellIntegrationModule();

    const api = integration.getTerminalShellExecutionApi({});

    expect(api).toBeNull();
    expect(integration.getTerminalMonitoringCapability({})).toBe("none");
  });

  it("maps host capability and detection mode to effective capability", async () => {
    const integration = await loadTerminalShellIntegrationModule();

    expect(
      integration.getEffectiveTerminalMonitoringCapability(
        "outputOnly",
        "exitCode",
      ),
    ).toBe("none");
    expect(
      integration.getEffectiveTerminalMonitoringCapability(
        "exitCodeOnly",
        "output",
      ),
    ).toBe("none");
    expect(
      integration.getEffectiveTerminalMonitoringCapability("full", "output"),
    ).toBe("outputOnly");
    expect(
      integration.getEffectiveTerminalMonitoringCapability("full", "exitCode"),
    ).toBe("exitCodeOnly");
    expect(
      integration.getEffectiveTerminalMonitoringCapability("full", "either"),
    ).toBe("full");
  });

  it("accepts only execution objects that expose a read method", async () => {
    const integration = await loadTerminalShellIntegrationModule();

    expect(
      integration.isTerminalExecutionLike({
        read: async function* () {},
      }),
    ).toBe(true);
    expect(integration.isTerminalExecutionLike({})).toBe(false);
    expect(integration.isTerminalExecutionLike(null)).toBe(false);
  });

  it("treats any non-null object as a valid execution identity", async () => {
    const integration = await loadTerminalShellIntegrationModule();

    expect(integration.isExecutionIdentity({})).toBe(true);
    expect(integration.isExecutionIdentity(null)).toBe(false);
    expect(integration.isExecutionIdentity("execution")).toBe(false);
  });
});
