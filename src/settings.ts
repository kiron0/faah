import * as vscode from "vscode";

const settingsStorageKey = "faah.settings.v1";
const minCooldownMs = 500;
const patternModes = ["override", "append"] as const;
const diagnosticsSeverityModes = ["error", "warningAndError"] as const;

const defaultPatterns = [
  "\\berror\\b",
  "\\bfailed\\b",
  "\\bfailure\\b",
  "\\bfatal\\b",
  "\\bexception\\b",
  "\\bcritical\\b",
  "\\berr(or)?[:!\\]]",
  "\\buncaught\\b",
  "UnhandledPromiseRejection",
  "Traceback \\(most recent call last\\):",
  "\\bsyntaxerror\\b",
  "\\btypeerror\\b",
  "\\breferenceerror\\b",
  "\\brangeerror\\b",
  "\\bmodule\\s+not\\s+found\\b",
  "\\bcannot\\s+find\\s+module\\b",
  "\\bno\\s+module\\s+named\\b",
  "\\bsegmentation\\s+fault\\b",
  "\\bcore\\s+dumped\\b",
  "\\bpanic:|\\bpanicked\\s+at\\b",
  "^\\s*caused\\s+by:",
  "\\bpermission\\s+denied\\b",
  "\\baccess\\s+denied\\b",
  "\\bcommand\\s+not\\s+found\\b",
  "\\btimeout(?:\\s+exceeded)?\\b",
  "\\bconnection\\s+(?:refused|reset|timed\\s*out)\\b",
  "\\bhttp\\s+5\\d\\d\\b",
] as const;

const defaultExcludePatterns = [
  "^\\[[^\\]]+\\s[0-9a-f]{7,40}\\]\\s(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\\([^)]+\\))?!?:\\s.+$",
  "^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\\([^)]+\\))?!?:\\s.+$",
] as const;

const defaultCompiledPatterns = defaultPatterns.map((pattern) => new RegExp(pattern, "i"));

export type PatternMode = (typeof patternModes)[number];
export type DiagnosticsSeverityMode = (typeof diagnosticsSeverityModes)[number];

export type StoredSettings = {
  enabled: boolean;
  monitorTerminal: boolean;
  monitorDiagnostics: boolean;
  diagnosticsSeverity: DiagnosticsSeverityMode;
  cooldownMs: number;
  patternMode: PatternMode;
  volumePercent: number;
  patterns: string[];
  excludePatterns: string[];
};

export type RuntimeSettings = {
  enabled: boolean;
  monitorTerminal: boolean;
  monitorDiagnostics: boolean;
  diagnosticsSeverity: DiagnosticsSeverityMode;
  cooldownMs: number;
  volumePercent: number;
  patterns: RegExp[];
  excludePatterns: RegExp[];
};

export const defaultStoredSettings: StoredSettings = {
  enabled: true,
  monitorTerminal: true,
  monitorDiagnostics: true,
  diagnosticsSeverity: "error",
  cooldownMs: 1500,
  patternMode: "override",
  volumePercent: 70,
  patterns: [...defaultPatterns],
  excludePatterns: [...defaultExcludePatterns],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function compileRegexList(rawPatterns: readonly string[], kind: "pattern" | "exclude"): RegExp[] {
  return rawPatterns
    .map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch {
        console.warn(`[faah] Ignoring invalid ${kind} regex: ${pattern}`);
        return null;
      }
    })
    .filter((pattern): pattern is RegExp => pattern !== null);
}

export function normalizeStoredSettings(input: Partial<StoredSettings> | undefined): StoredSettings {
  const source = input ?? {};
  const rawPatterns = Array.isArray(source.patterns)
    ? source.patterns.filter((item): item is string => typeof item === "string")
    : [...defaultPatterns];
  const rawExcludePatterns = Array.isArray(source.excludePatterns)
    ? source.excludePatterns.filter((item): item is string => typeof item === "string")
    : [...defaultExcludePatterns];

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultStoredSettings.enabled,
    monitorTerminal:
      typeof source.monitorTerminal === "boolean"
        ? source.monitorTerminal
        : defaultStoredSettings.monitorTerminal,
    monitorDiagnostics:
      typeof source.monitorDiagnostics === "boolean"
        ? source.monitorDiagnostics
        : defaultStoredSettings.monitorDiagnostics,
    diagnosticsSeverity: parseEnum(
      source.diagnosticsSeverity,
      diagnosticsSeverityModes,
      defaultStoredSettings.diagnosticsSeverity,
    ),
    cooldownMs: Math.max(
      typeof source.cooldownMs === "number" ? source.cooldownMs : defaultStoredSettings.cooldownMs,
      minCooldownMs,
    ),
    patternMode: parseEnum(source.patternMode, patternModes, defaultStoredSettings.patternMode),
    volumePercent: clamp(
      typeof source.volumePercent === "number"
        ? source.volumePercent
        : defaultStoredSettings.volumePercent,
      0,
      100,
    ),
    patterns: rawPatterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0),
    excludePatterns: rawExcludePatterns
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0),
  };
}

export function toRuntimeSettings(stored: StoredSettings): RuntimeSettings {
  const userPatterns = compileRegexList(stored.patterns, "pattern");
  const excludePatterns = compileRegexList(stored.excludePatterns, "exclude");
  const patterns =
    stored.patternMode === "append"
      ? [...defaultCompiledPatterns, ...userPatterns]
      : userPatterns.length > 0
        ? userPatterns
        : defaultCompiledPatterns;

  return {
    enabled: stored.enabled,
    monitorTerminal: stored.monitorTerminal,
    monitorDiagnostics: stored.monitorDiagnostics,
    diagnosticsSeverity: stored.diagnosticsSeverity,
    cooldownMs: stored.cooldownMs,
    volumePercent: stored.volumePercent,
    patterns,
    excludePatterns,
  };
}

export function loadStoredSettings(context: vscode.ExtensionContext): StoredSettings {
  const saved = context.globalState.get<Partial<StoredSettings>>(settingsStorageKey);
  return normalizeStoredSettings(saved);
}

export async function persistStoredSettings(
  context: vscode.ExtensionContext,
  settings: StoredSettings,
): Promise<void> {
  await context.globalState.update(settingsStorageKey, settings);
}
