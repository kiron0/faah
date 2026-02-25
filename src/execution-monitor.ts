import * as vscode from "vscode";

import { tryAcquirePlaybackWindow } from "./alert-gate";
import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

const tailByExecution = new WeakMap<vscode.TerminalShellExecution, string>();
const playedByExecution = new WeakSet<vscode.TerminalShellExecution>();
const maxTailLength = 500;
const ansiEscapeRegex = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function looksLikeError(line: string, patterns: RegExp[]): boolean {
  return patterns.some((r) => r.test(line));
}

function cleanTerminalText(text: string): string {
  return text.replace(ansiEscapeRegex, "").trim();
}

function hasErrorInChunk(
  execution: vscode.TerminalShellExecution,
  chunk: string,
  patterns: RegExp[],
): boolean {
  const previousTail = tailByExecution.get(execution) ?? "";
  const combined = previousTail + chunk;
  const lines = combined.split(/\r?\n/);
  const tail = lines.pop() ?? "";

  tailByExecution.set(execution, tail.slice(-maxTailLength));

  for (const rawLine of lines) {
    const line = cleanTerminalText(rawLine);
    if (!line) continue;
    if (looksLikeError(line, patterns)) return true;
  }

  return false;
}

export function tryPlayForExecution(
  execution: vscode.TerminalShellExecution,
  settings: RuntimeSettings,
  soundPath: string,
): void {
  if (playedByExecution.has(execution)) return;
  if (!tryAcquirePlaybackWindow(settings.cooldownMs)) return;

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

      if (hasErrorInChunk(execution, chunk, settings.patterns)) {
        tryPlayForExecution(execution, settings, getSoundPath());
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to read terminal shell execution stream: ${message}`);
  }
}
