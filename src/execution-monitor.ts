import * as vscode from "vscode";

import { getAlertSuppressionReason, tryAcquirePlaybackWindow } from "./alert-gate";
import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

const tailByExecution = new WeakMap<vscode.TerminalShellExecution, string>();
const playedByExecution = new WeakSet<vscode.TerminalShellExecution>();

const MAX_TAIL_LENGTH = 500;
const LINE_SPLIT_REGEX = /\r?\n/;
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function looksLikeError(line: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(line));
}

function isExcluded(line: string, excludePatterns: readonly RegExp[]): boolean {
  return excludePatterns.some((pattern) => pattern.test(line));
}

function normalizeTerminalLine(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, "").trim();
}

function hasErrorInChunk(
  execution: vscode.TerminalShellExecution,
  chunk: string,
  patterns: readonly RegExp[],
  excludePatterns: readonly RegExp[],
): boolean {
  const previousTail = tailByExecution.get(execution) ?? "";
  const lines = (previousTail + chunk).split(LINE_SPLIT_REGEX);
  const tail = lines.pop() ?? "";

  tailByExecution.set(execution, tail.slice(-MAX_TAIL_LENGTH));

  for (const rawLine of lines) {
    const line = normalizeTerminalLine(rawLine);
    if (!line) continue;
    if (!looksLikeError(line, patterns)) continue;
    if (isExcluded(line, excludePatterns)) continue;
    return true;
  }

  return false;
}

export function tryPlayForExecution(
  execution: vscode.TerminalShellExecution,
  settings: RuntimeSettings,
  soundPath: string,
): void {
  if (!settings.monitorTerminal) return;
  if (getAlertSuppressionReason(settings) !== null) return;
  if (playedByExecution.has(execution)) return;
  if (!tryAcquirePlaybackWindow(settings.terminalCooldownMs, "terminal")) return;

  playedByExecution.add(execution);
  playAlert(settings, soundPath);
}

export async function monitorExecutionOutput(
  execution: vscode.TerminalShellExecution,
  getSettings: () => RuntimeSettings,
  getSoundPath: () => string,
): Promise<void> {
  try {
    const stream = execution.read();
    for await (const chunk of stream) {
      if (!chunk) continue;

      const settings = getSettings();
      if (!settings.enabled) continue;
      if (!settings.monitorTerminal) continue;

      if (hasErrorInChunk(execution, chunk, settings.patterns, settings.excludePatterns)) {
        tryPlayForExecution(execution, settings, getSoundPath());
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to read terminal shell execution stream: ${message}`);
  }
}
