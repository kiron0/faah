import * as vscode from "vscode";

import { tryAcquirePlaybackWindow } from "./alert-gate";
import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

const tailByExecution = new WeakMap<vscode.TerminalShellExecution, string>();
const playedByExecution = new WeakSet<vscode.TerminalShellExecution>();

const MAX_TAIL_LENGTH = 500;
const LINE_SPLIT_REGEX = /\r?\n/;
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const BARE_ERROR_WORD_REGEX = /\berror\b/i;
const STRONG_ERROR_HINT_PATTERN_PARTS = [
  "failed",
  "failure",
  "fatal",
  "exception",
  "critical",
  "uncaught",
  "traceback",
  "syntaxerror",
  "typeerror",
  "referenceerror",
  "rangeerror",
  "module\\s+not\\s+found",
  "cannot\\s+find\\s+module",
  "no\\s+module\\s+named",
  "segmentation\\s+fault",
  "core\\s+dumped",
  "panic",
  "permission\\s+denied",
  "access\\s+denied",
  "command\\s+not\\s+found",
  "timeout",
  "connection\\s+(?:refused|reset|timed\\s*out)",
  "http\\s+5\\d\\d",
] as const;
const STRONG_ERROR_HINT_REGEX = new RegExp(
  `\\b(?:${STRONG_ERROR_HINT_PATTERN_PARTS.join("|")})\\b`,
  "i",
);
const GIT_COMMIT_SUMMARY_REGEX = /^\[[^\]]+\s[0-9a-f]{7,40}\]\s.+$/i;
const CONVENTIONAL_COMMIT_TYPE_PART = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
].join("|");
const CONVENTIONAL_COMMIT_SUBJECT_REGEX = new RegExp(
  `^(?:\\[[^\\]]+\\]\\s+)?(?:${CONVENTIONAL_COMMIT_TYPE_PART})(?:\\([^)]+\\))?!?:\\s.+$`,
  "i",
);

function looksLikeError(line: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(line));
}

function normalizeTerminalLine(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, "").trim();
}

function isBenignCommitSummaryLine(line: string): boolean {
  if (!BARE_ERROR_WORD_REGEX.test(line)) return false;
  if (STRONG_ERROR_HINT_REGEX.test(line)) return false;

  return (
    GIT_COMMIT_SUMMARY_REGEX.test(line) || CONVENTIONAL_COMMIT_SUBJECT_REGEX.test(line)
  );
}

function hasErrorInChunk(
  execution: vscode.TerminalShellExecution,
  chunk: string,
  patterns: readonly RegExp[],
): boolean {
  const previousTail = tailByExecution.get(execution) ?? "";
  const lines = (previousTail + chunk).split(LINE_SPLIT_REGEX);
  const tail = lines.pop() ?? "";

  tailByExecution.set(execution, tail.slice(-MAX_TAIL_LENGTH));

  for (const rawLine of lines) {
    const line = normalizeTerminalLine(rawLine);
    if (!line) continue;
    if (!looksLikeError(line, patterns)) continue;
    if (isBenignCommitSummaryLine(line)) continue;
    return true;
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
