import {
  getAlertSuppressionReason,
  tryAcquirePlaybackWindow,
} from "./alert-gate";
import { triggerAlert } from "./alert-dispatch";
import type { RuntimeSettings } from "./settings";

export type TerminalExecutionLike = object & {
  read(): AsyncIterable<string>;
};

let tailByExecution = new WeakMap<TerminalExecutionLike, string>();
let playedByExecution = new WeakSet<object>();

const MAX_TAIL_LENGTH = 500;
const LINE_SPLIT_REGEX = /\r?\n/;
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function shouldMonitorTerminalOutput(settings: RuntimeSettings): boolean {
  return settings.terminalDetectionMode !== "exitCode";
}

function shouldMonitorTerminalExitCode(settings: RuntimeSettings): boolean {
  return settings.terminalDetectionMode !== "output";
}

function looksLikeError(line: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(line));
}

function isExcluded(line: string, excludePatterns: readonly RegExp[]): boolean {
  return excludePatterns.some((pattern) => pattern.test(line));
}

function normalizeTerminalLine(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, "").trim();
}

function matchesAlertPatterns(
  text: string,
  patterns: readonly RegExp[],
  excludePatterns: readonly RegExp[],
): boolean {
  const line = normalizeTerminalLine(text);
  if (!line) return false;
  if (!looksLikeError(line, patterns)) return false;
  if (isExcluded(line, excludePatterns)) return false;
  return true;
}

function hasErrorInChunk(
  execution: TerminalExecutionLike,
  chunk: string,
  patterns: readonly RegExp[],
  excludePatterns: readonly RegExp[],
): boolean {
  const previousTail = tailByExecution.get(execution) ?? "";
  const lines = (previousTail + chunk).split(LINE_SPLIT_REGEX);
  const tail = lines.pop() ?? "";

  tailByExecution.set(execution, tail.slice(-MAX_TAIL_LENGTH));

  for (const rawLine of lines) {
    if (matchesAlertPatterns(rawLine, patterns, excludePatterns)) return true;
  }

  return false;
}

export function tryPlayForExecution(
  execution: object,
  settings: RuntimeSettings,
  soundPath: string,
): void {
  if (!settings.monitorTerminal) return;
  if (getAlertSuppressionReason(settings) !== null) return;
  if (playedByExecution.has(execution)) return;
  if (!tryAcquirePlaybackWindow(settings.terminalCooldownMs, "terminal"))
    return;

  playedByExecution.add(execution);
  triggerAlert("terminal", settings, soundPath);
}

export async function monitorExecutionOutput(
  execution: TerminalExecutionLike,
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
      if (!shouldMonitorTerminalOutput(settings)) continue;

      if (
        hasErrorInChunk(
          execution,
          chunk,
          settings.patterns,
          settings.excludePatterns,
        )
      ) {
        tryPlayForExecution(execution, settings, getSoundPath());
      }
    }

    const settings = getSettings();
    const finalTail = tailByExecution.get(execution) ?? "";
    if (
      settings.enabled &&
      settings.monitorTerminal &&
      shouldMonitorTerminalOutput(settings) &&
      matchesAlertPatterns(
        finalTail,
        settings.patterns,
        settings.excludePatterns,
      )
    ) {
      tryPlayForExecution(execution, settings, getSoundPath());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to read terminal shell execution stream: ${message}`);
  }
}

export function resetExecutionMonitorState(): void {
  tailByExecution = new WeakMap<TerminalExecutionLike, string>();
  playedByExecution = new WeakSet<object>();
}
