import * as vscode from "vscode";

import { commandIds } from "./commands";
import type { RuntimeSettings } from "./settings";

type StatusBarRuntimeState = {
  snoozeRemainingMs?: number;
  terminalMonitoringSupported?: boolean;
};

function summarizeSources(
  settings: RuntimeSettings,
  terminalMonitoringSupported: boolean,
): string {
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
  item.command = commandIds.showQuickActions;
  item.show();

  const update = (
    settings: RuntimeSettings,
    runtimeState?: StatusBarRuntimeState,
  ): void => {
    const terminalMonitoringSupported =
      runtimeState?.terminalMonitoringSupported ?? true;
    const sourceSummary = summarizeSources(
      settings,
      terminalMonitoringSupported,
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
        : "";
    item.text = isSnoozed
      ? "$(bell-slash) Faah Snoozed"
      : `$(bell) Faah ${sourceSummary}${unsupportedTerminalBadge}`;
    item.tooltip = [
      `Sources: ${sourceSummary}`,
      `Diagnostics severity: ${describeDiagnosticsSeverity(settings)}`,
      ...(settings.monitorTerminal && !terminalMonitoringSupported
        ? ["Terminal monitoring: unavailable in this Cursor/VS Code version."]
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
