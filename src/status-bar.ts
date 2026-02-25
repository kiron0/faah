import * as vscode from "vscode";

import { commandIds } from "./commands";
import type { RuntimeSettings } from "./settings";

function summarizeSources(settings: RuntimeSettings): string {
  if (settings.monitorTerminal && settings.monitorDiagnostics) return "T+E";
  if (settings.monitorTerminal) return "T";
  if (settings.monitorDiagnostics) return "E";
  return "None";
}

function describeDiagnosticsSeverity(settings: RuntimeSettings): string {
  return settings.diagnosticsSeverity === "warningAndError" ? "Error + Warning" : "Error only";
}

export function createStatusBarController(): {
  item: vscode.StatusBarItem;
  update: (settings: RuntimeSettings) => void;
} {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = "Faah";
  item.command = commandIds.showQuickActions;
  item.show();

  const update = (settings: RuntimeSettings): void => {
    const sourceSummary = summarizeSources(settings);

    if (!settings.enabled) {
      item.text = "$(bell-slash) Faah Off";
      item.tooltip = [
        "Faah monitoring is disabled.",
        "Click for quick actions.",
      ].join("\n");
      return;
    }

    item.text = `$(bell) Faah ${sourceSummary}`;
    item.tooltip = [
      `Sources: ${sourceSummary}`,
      `Diagnostics severity: ${describeDiagnosticsSeverity(settings)}`,
      `Cooldown: ${settings.cooldownMs}ms`,
      "Click for quick actions.",
    ].join("\n");
  };

  return { item, update };
}

