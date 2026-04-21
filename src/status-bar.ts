import * as vscode from "vscode";

import { commandIds } from "./commands";
import type { RuntimeSettings } from "./settings";
import {
  getEffectiveTerminalMonitoringCapability,
  type TerminalMonitoringCapability,
} from "./terminal-shell-integration";

type StatusBarRuntimeState = {
  snoozeRemainingMs?: number;
  terminalMonitoringCapability?: TerminalMonitoringCapability;
};

function summarizeSources(
  settings: RuntimeSettings,
  terminalMonitoringCapability: TerminalMonitoringCapability,
): string {
  const terminalMonitoringSupported =
    getEffectiveTerminalMonitoringCapability(
      terminalMonitoringCapability,
      settings.terminalDetectionMode,
    ) !== "none";
  const terminalMonitoringEnabled =
    settings.monitorTerminal && terminalMonitoringSupported;

  if (terminalMonitoringEnabled && settings.monitorDiagnostics) return "T+E";
  if (terminalMonitoringEnabled) return "T";
  if (settings.monitorDiagnostics) return "E";
  return "None";
}

function describeDiagnosticsSeverity(settings: RuntimeSettings): string {
  return settings.diagnosticsSeverity === "warningAndError"
    ? "Error + Warning"
    : "Error only";
}

function describeQuietHours(settings: RuntimeSettings): string {
  if (!settings.quietHoursEnabled) return "Off";
  return `${settings.quietHoursStart} - ${settings.quietHoursEnd}`;
}

function formatSnoozeRemaining(snoozeRemainingMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(snoozeRemainingMs / 60_000));
  if (totalMinutes >= 60) {
    const hours = Math.ceil(totalMinutes / 60);
    return `${hours}h`;
  }
  return `${totalMinutes}m`;
}

export function createStatusBarController(): {
  item: vscode.StatusBarItem;
  update: (
    settings: RuntimeSettings,
    runtimeState?: StatusBarRuntimeState,
  ) => void;
} {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.name = "Faah";
  item.show();

  const update = (
    settings: RuntimeSettings,
    runtimeState?: StatusBarRuntimeState,
  ): void => {
    const terminalMonitoringCapability =
      runtimeState?.terminalMonitoringCapability ?? "full";
    const effectiveTerminalMonitoringCapability =
      getEffectiveTerminalMonitoringCapability(
        terminalMonitoringCapability,
        settings.terminalDetectionMode,
      );
    const terminalMonitoringSupported =
      effectiveTerminalMonitoringCapability !== "none";
    const sourceSummary = summarizeSources(
      settings,
      terminalMonitoringCapability,
    );
    const snoozeRemainingMs = runtimeState?.snoozeRemainingMs ?? 0;
    const isSnoozed = snoozeRemainingMs > 0;

    if (!settings.enabled) {
      item.text = "$(bell-slash) Faah Off";
      item.tooltip = [
        "Faah monitoring is disabled.",
        "Click for quick actions.",
      ].join("\n");
      return;
    }

    const unsupportedTerminalBadge =
      settings.monitorTerminal && !terminalMonitoringSupported
        ? " $(warning)"
        : settings.monitorTerminal &&
            effectiveTerminalMonitoringCapability !== "full"
          ? " $(info)"
        : "";
    item.text = isSnoozed
      ? "$(bell-slash) Faah Snoozed"
      : `$(bell) Faah ${sourceSummary}${unsupportedTerminalBadge}`;
    item.tooltip = [
      `Sources: ${sourceSummary}`,
      `Diagnostics severity: ${describeDiagnosticsSeverity(settings)}`,
      ...(settings.monitorTerminal && !terminalMonitoringSupported
        ? [
            terminalMonitoringCapability === "none"
              ? "Terminal monitoring: unavailable in this Cursor/VS Code version."
              : "Terminal monitoring: current detection mode is unavailable in this host. Change Terminal Detection Mode to a supported signal.",
          ]
        : settings.monitorTerminal &&
            effectiveTerminalMonitoringCapability === "exitCodeOnly"
          ? [
              "Terminal monitoring: partial host support. Exit-code alerts work, but output-stream monitoring is unavailable.",
            ]
        : settings.monitorTerminal &&
            effectiveTerminalMonitoringCapability === "outputOnly"
          ? [
              "Terminal monitoring: partial host support. Output-stream alerts work, but exit-code monitoring is unavailable.",
            ]
        : []),
      `Terminal cooldown: ${settings.terminalCooldownMs}ms`,
      `Diagnostics cooldown: ${settings.diagnosticsCooldownMs}ms`,
      `Quiet hours: ${describeQuietHours(settings)}`,
      ...(isSnoozed
        ? [`Snooze remaining: ${formatSnoozeRemaining(snoozeRemainingMs)}`]
        : []),
      "Click for quick actions.",
    ].join("\n");
  };

  return { item, update };
}
