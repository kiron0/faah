import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ExecException } from "child_process";
import playSound from "play-sound";

const player = playSound({});

let lastPlayedAt = 0;
const tailByExecution = new WeakMap<vscode.TerminalShellExecution, string>();
const playedByExecution = new WeakSet<vscode.TerminalShellExecution>();
const maxTailLength = 500;
const ansiEscapeRegex = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const defaultPatterns = [
  "\\berror\\b",
  "\\bfailed\\b",
  "ERR!",
  "UnhandledPromiseRejection",
  "Traceback \\(most recent call last\\):",
  "Exception",
  "Segmentation fault",
] as const;

type ExtensionSettings = {
  enabled: boolean;
  cooldownMs: number;
  soundFile: string;
  patterns: RegExp[];
};

function shouldPlayNow(cooldownMs: number) {
  const now = Date.now();
  if (now - lastPlayedAt < cooldownMs) return false;
  lastPlayedAt = now;
  return true;
}

function looksLikeError(line: string, patterns: RegExp[]) {
  return patterns.some((r) => r.test(line));
}

function cleanTerminalText(text: string): string {
  return text.replace(ansiEscapeRegex, "").trim();
}

function loadSettings(): ExtensionSettings {
  const cfg = vscode.workspace.getConfiguration("terminalErrorSound");
  const rawPatterns = cfg.get<string[]>("patterns", [...defaultPatterns]);
  const compiledPatterns = rawPatterns
    .map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch {
        console.warn(`[terminalErrorSound] Ignoring invalid regex pattern: ${pattern}`);
        return null;
      }
    })
    .filter((pattern): pattern is RegExp => pattern !== null);

  return {
    enabled: cfg.get<boolean>("enabled", true),
    cooldownMs: Math.max(cfg.get<number>("cooldownMs", 1500), 0),
    soundFile: cfg.get<string>("soundFile", "faah.mp3"),
    patterns:
      compiledPatterns.length > 0
        ? compiledPatterns
        : defaultPatterns.map((pattern) => new RegExp(pattern, "i")),
  };
}

function resolveSoundPath(context: vscode.ExtensionContext, configuredFile: string): string {
  const candidates = [
    context.asAbsolutePath(path.join("media", configuredFile)),
    context.asAbsolutePath(path.join("media", "faah.mp3")),
    context.asAbsolutePath(path.join("media", "faaah.mp3")),
  ];

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ?? candidates[0];
}

function playMp3(soundPath: string) {
  player.play(soundPath, (err?: ExecException) => {
    if (!err) return;
    const errText = err.message ?? String(err);
    console.warn(`Failed to play sound: ${errText}`);
  });
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

function tryPlayForExecution(
  execution: vscode.TerminalShellExecution,
  cooldownMs: number,
  soundPath: string,
) {
  if (playedByExecution.has(execution)) return;
  if (!shouldPlayNow(cooldownMs)) return;

  playMp3(soundPath);
  playedByExecution.add(execution);
}

async function monitorExecutionOutput(
  execution: vscode.TerminalShellExecution,
  getSettings: () => ExtensionSettings,
  getSoundPath: () => string,
) {
  try {
    const stream = execution.read();
    for await (const chunk of stream) {
      if (!chunk) continue;

      const settings = getSettings();
      if (!settings.enabled) continue;

      if (hasErrorInChunk(execution, chunk, settings.patterns)) {
        tryPlayForExecution(execution, settings.cooldownMs, getSoundPath());
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to read terminal shell execution stream: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  let settings = loadSettings();
  let soundPath = resolveSoundPath(context, settings.soundFile);

  if (!fs.existsSync(soundPath)) {
    vscode.window.showWarningMessage(
      `Terminal Error Sound could not find audio file: ${settings.soundFile} in media/.`,
    );
  }

  const startDisposable = vscode.window.onDidStartTerminalShellExecution((event) => {
    if (!settings.enabled) return;
    void monitorExecutionOutput(event.execution, () => settings, () => soundPath);
  });

  const endDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
    if (!settings.enabled) return;
    if (event.exitCode === undefined || event.exitCode === 0) return;
    tryPlayForExecution(event.execution, settings.cooldownMs, soundPath);
  });

  const configDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration("terminalErrorSound")) return;
    settings = loadSettings();
    soundPath = resolveSoundPath(context, settings.soundFile);
  });

  const testSoundDisposable = vscode.commands.registerCommand(
    "terminalErrorSound.playTestSound",
    () => {
      if (!fs.existsSync(soundPath)) {
        vscode.window.showWarningMessage(
          `Terminal Error Sound could not find audio file: ${settings.soundFile} in media/.`,
        );
        return;
      }
      playMp3(soundPath);
    },
  );

  context.subscriptions.push(startDisposable, endDisposable, configDisposable, testSoundDisposable);
}

export function deactivate() {}
