import * as vscode from "vscode";

import type { TerminalExecutionLike } from "./execution-monitor";
import type { TerminalDetectionMode } from "./settings";

type TerminalShellExecutionWindowLike = {
  onDidStartTerminalShellExecution?: unknown;
  onDidEndTerminalShellExecution?: unknown;
};

export type TerminalShellExecutionStartEventLike = {
  execution: TerminalExecutionLike;
};

export type TerminalShellExecutionEndEventLike = {
  execution: object;
  exitCode?: number;
};

export type TerminalShellExecutionApi = {
  onDidStartTerminalShellExecution?: vscode.Event<TerminalShellExecutionStartEventLike>;
  onDidEndTerminalShellExecution?: vscode.Event<TerminalShellExecutionEndEventLike>;
};

export type TerminalMonitoringCapability =
  | "none"
  | "outputOnly"
  | "exitCodeOnly"
  | "full";

function isEventLike(value: unknown): value is vscode.Event<unknown> {
  return typeof value === "function";
}

export function isTerminalExecutionLike(
  value: unknown,
): value is TerminalExecutionLike {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { read?: unknown }).read === "function";
}

export function isExecutionIdentity(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

export function getTerminalMonitoringCapability(
  windowApi: TerminalShellExecutionWindowLike = vscode.window as TerminalShellExecutionWindowLike,
): TerminalMonitoringCapability {
  const hasStartEvent = isEventLike(windowApi.onDidStartTerminalShellExecution);
  const hasEndEvent = isEventLike(windowApi.onDidEndTerminalShellExecution);

  if (hasStartEvent && hasEndEvent) return "full";
  if (hasStartEvent) return "outputOnly";
  if (hasEndEvent) return "exitCodeOnly";
  return "none";
}

export function getEffectiveTerminalMonitoringCapability(
  capability: TerminalMonitoringCapability,
  detectionMode: TerminalDetectionMode,
): TerminalMonitoringCapability {
  if (capability === "none") return "none";
  if (detectionMode === "either") return capability;

  if (detectionMode === "output") {
    if (capability === "exitCodeOnly") return "none";
    return "outputOnly";
  }

  if (capability === "outputOnly") return "none";
  return "exitCodeOnly";
}

export function getTerminalShellExecutionApi(
  windowApi: TerminalShellExecutionWindowLike = vscode.window as TerminalShellExecutionWindowLike,
): TerminalShellExecutionApi | null {
  if (getTerminalMonitoringCapability(windowApi) === "none") {
    return null;
  }

  const startEvent = windowApi.onDidStartTerminalShellExecution;
  const endEvent = windowApi.onDidEndTerminalShellExecution;

  return {
    ...(isEventLike(startEvent)
      ? {
          onDidStartTerminalShellExecution:
            startEvent as vscode.Event<TerminalShellExecutionStartEventLike>,
        }
      : {}),
    ...(isEventLike(endEvent)
      ? {
          onDidEndTerminalShellExecution:
            endEvent as vscode.Event<TerminalShellExecutionEndEventLike>,
        }
      : {}),
  };
}
