import * as vscode from "vscode";

const settingsStorageKey = "faah.settings.v1";
const configurationSection = "faah";
const minCooldownMs = 500;
const patternModes = ["override", "append"] as const;
const diagnosticsSeverityModes = ["error", "warningAndError"] as const;
const quietHoursTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
  terminalCooldownMs: number;
  diagnosticsCooldownMs: number;
  patternMode: PatternMode;
  volumePercent: number;
  customSoundPath: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  patterns: string[];
  excludePatterns: string[];
};

export type RuntimeSettings = {
  enabled: boolean;
  monitorTerminal: boolean;
  monitorDiagnostics: boolean;
  diagnosticsSeverity: DiagnosticsSeverityMode;
  cooldownMs: number;
  terminalCooldownMs: number;
  diagnosticsCooldownMs: number;
  volumePercent: number;
  customSoundPath: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  patterns: RegExp[];
  excludePatterns: RegExp[];
};

export const defaultStoredSettings: StoredSettings = {
  enabled: true,
  monitorTerminal: true,
  monitorDiagnostics: true,
  diagnosticsSeverity: "error",
  cooldownMs: 1500,
  terminalCooldownMs: 1500,
  diagnosticsCooldownMs: 1500,
  patternMode: "override",
  volumePercent: 70,
  customSoundPath: "",
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  patterns: [...defaultPatterns],
  excludePatterns: [...defaultExcludePatterns],
};

export type SettingsPersistTarget = "auto" | "workspace" | "global";

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

export function isValidQuietHoursTime(value: string): boolean {
  return quietHoursTimeRegex.test(value);
}

function normalizeQuietHoursTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return isValidQuietHoursTime(normalized) ? normalized : fallback;
}

function readConfigurationOverride<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
): T | undefined {
  const inspected = config.inspect<T>(key);
  if (!inspected) return undefined;
  if (inspected.workspaceFolderValue !== undefined) return inspected.workspaceFolderValue;
  if (inspected.workspaceValue !== undefined) return inspected.workspaceValue;
  if (inspected.globalValue !== undefined) return inspected.globalValue;
  return undefined;
}

function resolveConfigurationTarget(target: SettingsPersistTarget): vscode.ConfigurationTarget {
  const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  if (target === "workspace" && hasWorkspace) return vscode.ConfigurationTarget.Workspace;
  if (target === "workspace" && !hasWorkspace) return vscode.ConfigurationTarget.Global;
  if (target === "auto") return vscode.ConfigurationTarget.Global;
  return vscode.ConfigurationTarget.Global;
}

export function normalizeStoredSettings(input: Partial<StoredSettings> | undefined): StoredSettings {
  const source = input ?? {};
  const fallbackCooldownMs = Math.max(
    typeof source.cooldownMs === "number" ? source.cooldownMs : defaultStoredSettings.cooldownMs,
    minCooldownMs,
  );
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
    cooldownMs: fallbackCooldownMs,
    terminalCooldownMs: Math.max(
      typeof source.terminalCooldownMs === "number" ? source.terminalCooldownMs : fallbackCooldownMs,
      minCooldownMs,
    ),
    diagnosticsCooldownMs: Math.max(
      typeof source.diagnosticsCooldownMs === "number"
        ? source.diagnosticsCooldownMs
        : fallbackCooldownMs,
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
    customSoundPath:
      typeof source.customSoundPath === "string"
        ? source.customSoundPath.trim()
        : defaultStoredSettings.customSoundPath,
    quietHoursEnabled:
      typeof source.quietHoursEnabled === "boolean"
        ? source.quietHoursEnabled
        : defaultStoredSettings.quietHoursEnabled,
    quietHoursStart: normalizeQuietHoursTime(source.quietHoursStart, defaultStoredSettings.quietHoursStart),
    quietHoursEnd: normalizeQuietHoursTime(source.quietHoursEnd, defaultStoredSettings.quietHoursEnd),
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
    terminalCooldownMs: stored.terminalCooldownMs,
    diagnosticsCooldownMs: stored.diagnosticsCooldownMs,
    volumePercent: stored.volumePercent,
    customSoundPath: stored.customSoundPath,
    quietHoursEnabled: stored.quietHoursEnabled,
    quietHoursStart: stored.quietHoursStart,
    quietHoursEnd: stored.quietHoursEnd,
    patterns,
    excludePatterns,
  };
}

export function loadStoredSettings(context: vscode.ExtensionContext): StoredSettings {
  const legacySaved = context.globalState.get<Partial<StoredSettings>>(settingsStorageKey);
  const config = vscode.workspace.getConfiguration(configurationSection);

  const configOverrides: Partial<StoredSettings> = {};

  const enabled = readConfigurationOverride<boolean>(config, "enabled");
  if (enabled !== undefined) configOverrides.enabled = enabled;

  const monitorTerminal = readConfigurationOverride<boolean>(config, "monitorTerminal");
  if (monitorTerminal !== undefined) configOverrides.monitorTerminal = monitorTerminal;

  const monitorDiagnostics = readConfigurationOverride<boolean>(config, "monitorDiagnostics");
  if (monitorDiagnostics !== undefined) configOverrides.monitorDiagnostics = monitorDiagnostics;

  const diagnosticsSeverity = readConfigurationOverride<DiagnosticsSeverityMode>(
    config,
    "diagnosticsSeverity",
  );
  if (diagnosticsSeverity !== undefined) configOverrides.diagnosticsSeverity = diagnosticsSeverity;

  const cooldownMs = readConfigurationOverride<number>(config, "cooldownMs");
  if (cooldownMs !== undefined) configOverrides.cooldownMs = cooldownMs;
  const terminalCooldownMs = readConfigurationOverride<number>(config, "terminalCooldownMs");
  if (terminalCooldownMs !== undefined) configOverrides.terminalCooldownMs = terminalCooldownMs;
  const diagnosticsCooldownMs = readConfigurationOverride<number>(config, "diagnosticsCooldownMs");
  if (diagnosticsCooldownMs !== undefined) configOverrides.diagnosticsCooldownMs = diagnosticsCooldownMs;

  const patternMode = readConfigurationOverride<PatternMode>(config, "patternMode");
  if (patternMode !== undefined) configOverrides.patternMode = patternMode;

  const volumePercent = readConfigurationOverride<number>(config, "volumePercent");
  if (volumePercent !== undefined) configOverrides.volumePercent = volumePercent;
  const customSoundPath = readConfigurationOverride<string>(config, "customSoundPath");
  if (customSoundPath !== undefined) configOverrides.customSoundPath = customSoundPath;

  const quietHoursEnabled = readConfigurationOverride<boolean>(config, "quietHoursEnabled");
  if (quietHoursEnabled !== undefined) configOverrides.quietHoursEnabled = quietHoursEnabled;

  const quietHoursStart = readConfigurationOverride<string>(config, "quietHoursStart");
  if (quietHoursStart !== undefined) configOverrides.quietHoursStart = quietHoursStart;

  const quietHoursEnd = readConfigurationOverride<string>(config, "quietHoursEnd");
  if (quietHoursEnd !== undefined) configOverrides.quietHoursEnd = quietHoursEnd;

  const patterns = readConfigurationOverride<string[]>(config, "patterns");
  if (patterns !== undefined) configOverrides.patterns = patterns;

  const excludePatterns = readConfigurationOverride<string[]>(config, "excludePatterns");
  if (excludePatterns !== undefined) configOverrides.excludePatterns = excludePatterns;

  const hasConfigOverrides = Object.keys(configOverrides).length > 0;
  if (!hasConfigOverrides) return normalizeStoredSettings(legacySaved);
  return normalizeStoredSettings({
    ...(legacySaved ?? {}),
    ...configOverrides,
  });
}

export async function persistStoredSettings(
  context: vscode.ExtensionContext,
  settings: StoredSettings,
  target: SettingsPersistTarget = "auto",
): Promise<void> {
  const config = vscode.workspace.getConfiguration(configurationSection);
  const configurationTarget = resolveConfigurationTarget(target);

  await Promise.all([
    config.update("enabled", settings.enabled, configurationTarget),
    config.update("monitorTerminal", settings.monitorTerminal, configurationTarget),
    config.update("monitorDiagnostics", settings.monitorDiagnostics, configurationTarget),
    config.update("diagnosticsSeverity", settings.diagnosticsSeverity, configurationTarget),
    config.update("cooldownMs", settings.cooldownMs, configurationTarget),
    config.update("terminalCooldownMs", settings.terminalCooldownMs, configurationTarget),
    config.update("diagnosticsCooldownMs", settings.diagnosticsCooldownMs, configurationTarget),
    config.update("patternMode", settings.patternMode, configurationTarget),
    config.update("volumePercent", settings.volumePercent, configurationTarget),
    config.update("customSoundPath", settings.customSoundPath, configurationTarget),
    config.update("quietHoursEnabled", settings.quietHoursEnabled, configurationTarget),
    config.update("quietHoursStart", settings.quietHoursStart, configurationTarget),
    config.update("quietHoursEnd", settings.quietHoursEnd, configurationTarget),
    config.update("patterns", settings.patterns, configurationTarget),
    config.update("excludePatterns", settings.excludePatterns, configurationTarget),
  ]);

  await context.globalState.update(settingsStorageKey, settings);
}
