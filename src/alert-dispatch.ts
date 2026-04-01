import * as vscode from "vscode";

import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

export type AlertSource = "terminal" | "diagnostics";

const visualAlertThrottleMs = 1_200;
const lastVisualAlertAtMsBySource = new Map<AlertSource, number>();

function shouldShowVisualAlert(
  source: AlertSource,
  nowMs = Date.now(),
): boolean {
  const lastShownAtMs = lastVisualAlertAtMsBySource.get(source) ?? 0;
  if (nowMs - lastShownAtMs < visualAlertThrottleMs) return false;
  lastVisualAlertAtMsBySource.set(source, nowMs);
  return true;
}

function createVisualAlertMessage(source: AlertSource): string {
  if (source === "terminal") {
    return "Faah detected terminal error output.";
  }
  return "Faah detected editor diagnostics.";
}

export function triggerAlert(
  source: AlertSource,
  settings: RuntimeSettings,
  soundPath: string,
): void {
  playAlert(settings, soundPath);

  if (!settings.showVisualNotifications) return;
  if (!shouldShowVisualAlert(source)) return;

  void vscode.window.showWarningMessage(createVisualAlertMessage(source));
}
