import * as vscode from "vscode";

import type { TerminalExecutionLike } from "./execution-monitor";

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

export function getTerminalShellExecutionApi(
  windowApi: TerminalShellExecutionWindowLike = vscode.window as TerminalShellExecutionWindowLike,
): TerminalShellExecutionApi | null {
  const startEvent = windowApi.onDidStartTerminalShellExecution;
  const endEvent = windowApi.onDidEndTerminalShellExecution;

  if (!isEventLike(startEvent) && !isEventLike(endEvent)) {
    return null;
  }

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
