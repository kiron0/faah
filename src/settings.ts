import * as vscode from "vscode";

const settingsStorageKey = "faah.settings.v1";
const configurationSection = "faah";
const minCooldownMs = 500;
const patternModes = ["override", "append"] as const;
const diagnosticsSeverityModes = ["error", "warningAndError"] as const;
const terminalDetectionModes = ["either", "output", "exitCode"] as const;
const settingsPresetIds = ["balanced", "quiet", "aggressive"] as const;
const excludePresetIds = [
  "conventionalCommits",
  "testSnapshots",
  "lintSummaries",
  "packageManagerAdvisories",
] as const;
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

export const excludePatternPresetDefinitions = [
  {
    id: "conventionalCommits",
    label: "Conventional Commits",
    description: "Ignore commit summary lines that mention error-like words.",
    patterns: [...defaultExcludePatterns],
  },
  {
    id: "testSnapshots",
    label: "Test Snapshots",
    description: "Ignore snapshot/test text that talks about expected errors.",
    patterns: [
      "^\\s*(?:PASS|SNAPSHOT)\\b.*\\berror\\b.*$",
      "^\\s*Expected(?:.*)\\berror\\b.*$",
      "^\\s*Received(?:.*)\\berror\\b.*$",
    ],
  },
  {
    id: "lintSummaries",
    label: "Lint Summaries",
    description: "Ignore summary banners that report counts without real failure lines.",
    patterns: [
      "^\\s*\\d+\\s+warnings?(?:,\\s*\\d+\\s+errors?)?\\s*$",
      "^\\s*\\d+\\s+errors?,\\s*\\d+\\s+warnings?\\s*$",
      "^\\s*\\u2716\\s+\\d+\\s+problems?\\s*\\(\\s*\\d+\\s+errors?,\\s*\\d+\\s+warnings?\\s*\\)\\s*$",
    ],
  },
  {
    id: "packageManagerAdvisories",
    label: "Package Manager Advisories",
    description: "Ignore package-manager audit/advisory summaries unless command actually fails.",
    patterns: [
      "^\\s*(?:npm|yarn|pnpm|bun)\\s+(?:audit|advisory)\\b.*$",
      "^\\s*found\\s+\\d+\\s+vulnerabilit(?:y|ies)\\b.*$",
      "^\\s*\\d+\\s+packages?\\s+are\\s+looking\\s+for\\s+funding\\s*$",
    ],
  },
] as const;

const defaultCompiledPatterns = defaultPatterns.map(
  (pattern) => new RegExp(pattern, "i"),
);

export type PatternMode = (typeof patternModes)[number];
export type DiagnosticsSeverityMode = (typeof diagnosticsSeverityModes)[number];
export type TerminalDetectionMode = (typeof terminalDetectionModes)[number];
export type SettingsPresetId = (typeof settingsPresetIds)[number];
export type ExcludePresetId = (typeof excludePresetIds)[number];

export type StoredSettings = {
  enabled: boolean;
  monitorTerminal: boolean;
  monitorDiagnostics: boolean;
  diagnosticsSeverity: DiagnosticsSeverityMode;
  terminalDetectionMode: TerminalDetectionMode;
  cooldownMs: number;
  terminalCooldownMs: number;
  diagnosticsCooldownMs: number;
  patternMode: PatternMode;
  volumePercent: number;
  showVisualNotifications: boolean;
  customSoundPath: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  excludePresetIds: ExcludePresetId[];
  patterns: string[];
  excludePatterns: string[];
};

export type RuntimeSettings = {
  enabled: boolean;
  monitorTerminal: boolean;
  monitorDiagnostics: boolean;
  diagnosticsSeverity: DiagnosticsSeverityMode;
  terminalDetectionMode: TerminalDetectionMode;
  cooldownMs: number;
  terminalCooldownMs: number;
  diagnosticsCooldownMs: number;
  volumePercent: number;
  showVisualNotifications: boolean;
  customSoundPath: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  excludePresetIds: ExcludePresetId[];
  patterns: RegExp[];
  excludePatterns: RegExp[];
};

export const defaultStoredSettings: StoredSettings = {
  enabled: true,
  monitorTerminal: true,
  monitorDiagnostics: true,
  diagnosticsSeverity: "error",
  terminalDetectionMode: "either",
  cooldownMs: 1500,
  terminalCooldownMs: 1500,
  diagnosticsCooldownMs: 1500,
  patternMode: "override",
  volumePercent: 70,
  showVisualNotifications: false,
  customSoundPath: "",
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  excludePresetIds: [],
  patterns: [...defaultPatterns],
  excludePatterns: [...defaultExcludePatterns],
};

export type SettingsPersistTarget = "workspace" | "global";

export type PersistStoredSettingsResult = {
  skippedConfigurationKeys: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type CompiledRegexCacheEntry = {
  key: string;
  patterns: RegExp[];
  excludePatterns: RegExp[];
};

let compiledRegexCache: CompiledRegexCacheEntry | null = null;

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback;
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function compileRegexList(
  rawPatterns: readonly string[],
  kind: "pattern" | "exclude",
): RegExp[] {
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

function getExcludePresetPatterns(
  presetIdsToResolve: readonly ExcludePresetId[],
): string[] {
  return presetIdsToResolve.flatMap((presetId) => {
    const presetDefinition = excludePatternPresetDefinitions.find(
      (preset) => preset.id === presetId,
    );
    return presetDefinition ? [...presetDefinition.patterns] : [];
  });
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

  if (inspected.workspaceFolderValue !== undefined)
    return inspected.workspaceFolderValue;
  if (inspected.workspaceValue !== undefined) return inspected.workspaceValue;
  if (inspected.globalValue !== undefined) return inspected.globalValue;
  return undefined;
}

function updateConfigurationValue<T>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  value: T,
  target: vscode.ConfigurationTarget,
  skippedConfigurationKeys: string[],
): Promise<void> | undefined {
  const inspect = config.inspect;
  if (typeof inspect === "function" && inspect.call(config, key) === undefined) {
    console.warn(
      `[faah] Skipping update for unregistered configuration: ${configurationSection}.${key}`,
    );
    skippedConfigurationKeys.push(`${configurationSection}.${key}`);
    return undefined;
  }

  return Promise.resolve(config.update(key, value, target)).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[faah] Skipping configuration update for ${configurationSection}.${key}: ${message}`,
    );
    skippedConfigurationKeys.push(`${configurationSection}.${key}`);
  });
}

function resolveConfigurationTarget(
  target: SettingsPersistTarget,
): vscode.ConfigurationTarget {
  const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  if (target === "workspace" && hasWorkspace)
    return vscode.ConfigurationTarget.Workspace;
  if (target === "workspace" && !hasWorkspace)
    return vscode.ConfigurationTarget.Global;
  return vscode.ConfigurationTarget.Global;
}

export function normalizeStoredSettings(
  input: Partial<StoredSettings> | undefined,
): StoredSettings {
  const source = input ?? {};
  const fallbackCooldownMs = Math.max(
    typeof source.cooldownMs === "number"
      ? source.cooldownMs
      : defaultStoredSettings.cooldownMs,
    minCooldownMs,
  );
  const rawPatterns = Array.isArray(source.patterns)
    ? source.patterns.filter((item): item is string => typeof item === "string")
    : [...defaultPatterns];
  const rawExcludePatterns = Array.isArray(source.excludePatterns)
    ? source.excludePatterns.filter(
        (item): item is string => typeof item === "string",
      )
    : [...defaultExcludePatterns];

  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : defaultStoredSettings.enabled,
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
    terminalDetectionMode: parseEnum(
      source.terminalDetectionMode,
      terminalDetectionModes,
      defaultStoredSettings.terminalDetectionMode,
    ),
    cooldownMs: fallbackCooldownMs,
    terminalCooldownMs: Math.max(
      typeof source.terminalCooldownMs === "number"
        ? source.terminalCooldownMs
        : fallbackCooldownMs,
      minCooldownMs,
    ),
    diagnosticsCooldownMs: Math.max(
      typeof source.diagnosticsCooldownMs === "number"
        ? source.diagnosticsCooldownMs
        : fallbackCooldownMs,
      minCooldownMs,
    ),
    patternMode: parseEnum(
      source.patternMode,
      patternModes,
      defaultStoredSettings.patternMode,
    ),
    volumePercent: clamp(
      typeof source.volumePercent === "number"
        ? source.volumePercent
        : defaultStoredSettings.volumePercent,
      0,
      100,
    ),
    showVisualNotifications:
      typeof source.showVisualNotifications === "boolean"
        ? source.showVisualNotifications
        : defaultStoredSettings.showVisualNotifications,
    customSoundPath:
      typeof source.customSoundPath === "string"
        ? source.customSoundPath.trim()
        : defaultStoredSettings.customSoundPath,
    quietHoursEnabled:
      typeof source.quietHoursEnabled === "boolean"
        ? source.quietHoursEnabled
        : defaultStoredSettings.quietHoursEnabled,
    quietHoursStart: normalizeQuietHoursTime(
      source.quietHoursStart,
      defaultStoredSettings.quietHoursStart,
    ),
    quietHoursEnd: normalizeQuietHoursTime(
      source.quietHoursEnd,
      defaultStoredSettings.quietHoursEnd,
    ),
    excludePresetIds: Array.isArray(source.excludePresetIds)
      ? source.excludePresetIds.filter((item): item is ExcludePresetId =>
          (excludePresetIds as readonly string[]).includes(String(item)),
        )
      : [...defaultStoredSettings.excludePresetIds],
    patterns: rawPatterns
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0),
    excludePatterns: rawExcludePatterns
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0),
  };
}

export function toRuntimeSettings(stored: StoredSettings): RuntimeSettings {
  const cacheKey = JSON.stringify({
    patternMode: stored.patternMode,
    excludePresetIds: stored.excludePresetIds,
    patterns: stored.patterns,
    excludePatterns: stored.excludePatterns,
  });
  if (!compiledRegexCache || compiledRegexCache.key !== cacheKey) {
    const userPatterns = compileRegexList(stored.patterns, "pattern");
    const presetExcludePatterns = getExcludePresetPatterns(
      stored.excludePresetIds,
    );
    const excludePatterns = compileRegexList(
      [...presetExcludePatterns, ...stored.excludePatterns],
      "exclude",
    );
    const patterns =
      stored.patternMode === "append"
        ? [...defaultCompiledPatterns, ...userPatterns]
        : userPatterns.length > 0
          ? userPatterns
          : defaultCompiledPatterns;

    compiledRegexCache = {
      key: cacheKey,
      patterns,
      excludePatterns,
    };
  }

  return {
    enabled: stored.enabled,
    monitorTerminal: stored.monitorTerminal,
    monitorDiagnostics: stored.monitorDiagnostics,
    diagnosticsSeverity: stored.diagnosticsSeverity,
    terminalDetectionMode: stored.terminalDetectionMode,
    cooldownMs: stored.cooldownMs,
    terminalCooldownMs: stored.terminalCooldownMs,
    diagnosticsCooldownMs: stored.diagnosticsCooldownMs,
    volumePercent: stored.volumePercent,
    showVisualNotifications: stored.showVisualNotifications,
    customSoundPath: stored.customSoundPath,
    quietHoursEnabled: stored.quietHoursEnabled,
    quietHoursStart: stored.quietHoursStart,
    quietHoursEnd: stored.quietHoursEnd,
    excludePresetIds: stored.excludePresetIds,
    patterns: compiledRegexCache.patterns,
    excludePatterns: compiledRegexCache.excludePatterns,
  };
}

export function loadStoredSettings(
  context: vscode.ExtensionContext,
): StoredSettings {
  const legacySaved =
    context.globalState.get<Partial<StoredSettings>>(settingsStorageKey);
  const config = vscode.workspace.getConfiguration(configurationSection);

  const configOverrides: Partial<StoredSettings> = {};

  const enabled = readConfigurationOverride<boolean>(config, "enabled");
  if (enabled !== undefined) configOverrides.enabled = enabled;

  const monitorTerminal = readConfigurationOverride<boolean>(
    config,
    "monitorTerminal",
  );
  if (monitorTerminal !== undefined)
    configOverrides.monitorTerminal = monitorTerminal;

  const monitorDiagnostics = readConfigurationOverride<boolean>(
    config,
    "monitorDiagnostics",
  );
  if (monitorDiagnostics !== undefined)
    configOverrides.monitorDiagnostics = monitorDiagnostics;

  const diagnosticsSeverity =
    readConfigurationOverride<DiagnosticsSeverityMode>(
      config,
      "diagnosticsSeverity",
    );
  if (diagnosticsSeverity !== undefined)
    configOverrides.diagnosticsSeverity = diagnosticsSeverity;
  const terminalDetectionMode =
    readConfigurationOverride<TerminalDetectionMode>(
      config,
      "terminalDetectionMode",
    );
  if (terminalDetectionMode !== undefined) {
    configOverrides.terminalDetectionMode = terminalDetectionMode;
  }

  const cooldownMs = readConfigurationOverride<number>(config, "cooldownMs");
  if (cooldownMs !== undefined) configOverrides.cooldownMs = cooldownMs;
  const terminalCooldownMs = readConfigurationOverride<number>(
    config,
    "terminalCooldownMs",
  );
  if (terminalCooldownMs !== undefined)
    configOverrides.terminalCooldownMs = terminalCooldownMs;
  const diagnosticsCooldownMs = readConfigurationOverride<number>(
    config,
    "diagnosticsCooldownMs",
  );
  if (diagnosticsCooldownMs !== undefined)
    configOverrides.diagnosticsCooldownMs = diagnosticsCooldownMs;

  const patternMode = readConfigurationOverride<PatternMode>(
    config,
    "patternMode",
  );
  if (patternMode !== undefined) configOverrides.patternMode = patternMode;

  const volumePercent = readConfigurationOverride<number>(
    config,
    "volumePercent",
  );
  if (volumePercent !== undefined)
    configOverrides.volumePercent = volumePercent;
  const showVisualNotifications = readConfigurationOverride<boolean>(
    config,
    "showVisualNotifications",
  );
  if (showVisualNotifications !== undefined) {
    configOverrides.showVisualNotifications = showVisualNotifications;
  }
  const customSoundPath = readConfigurationOverride<string>(
    config,
    "customSoundPath",
  );
  if (customSoundPath !== undefined)
    configOverrides.customSoundPath = customSoundPath;

  const quietHoursEnabled = readConfigurationOverride<boolean>(
    config,
    "quietHoursEnabled",
  );
  if (quietHoursEnabled !== undefined)
    configOverrides.quietHoursEnabled = quietHoursEnabled;

  const quietHoursStart = readConfigurationOverride<string>(
    config,
    "quietHoursStart",
  );
  if (quietHoursStart !== undefined)
    configOverrides.quietHoursStart = quietHoursStart;

  const quietHoursEnd = readConfigurationOverride<string>(
    config,
    "quietHoursEnd",
  );
  if (quietHoursEnd !== undefined)
    configOverrides.quietHoursEnd = quietHoursEnd;
  const excludePresetIdsValue = readConfigurationOverride<ExcludePresetId[]>(
    config,
    "excludePresetIds",
  );
  if (excludePresetIdsValue !== undefined) {
    configOverrides.excludePresetIds = excludePresetIdsValue;
  }

  const patterns = readConfigurationOverride<string[]>(config, "patterns");
  if (patterns !== undefined) configOverrides.patterns = patterns;

  const excludePatterns = readConfigurationOverride<string[]>(
    config,
    "excludePatterns",
  );
  if (excludePatterns !== undefined)
    configOverrides.excludePatterns = excludePatterns;

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
  target: SettingsPersistTarget = "global",
): Promise<PersistStoredSettingsResult> {
  const config = vscode.workspace.getConfiguration(configurationSection);
  const configurationTarget = resolveConfigurationTarget(target);
  const skippedConfigurationKeys: string[] = [];

  await Promise.all([
    updateConfigurationValue(
      config,
      "enabled",
      settings.enabled,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "monitorTerminal",
      settings.monitorTerminal,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "monitorDiagnostics",
      settings.monitorDiagnostics,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "diagnosticsSeverity",
      settings.diagnosticsSeverity,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "terminalDetectionMode",
      settings.terminalDetectionMode,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "cooldownMs",
      settings.cooldownMs,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "terminalCooldownMs",
      settings.terminalCooldownMs,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "diagnosticsCooldownMs",
      settings.diagnosticsCooldownMs,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "patternMode",
      settings.patternMode,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "volumePercent",
      settings.volumePercent,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "showVisualNotifications",
      settings.showVisualNotifications,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "customSoundPath",
      settings.customSoundPath,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "quietHoursEnabled",
      settings.quietHoursEnabled,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "quietHoursStart",
      settings.quietHoursStart,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "quietHoursEnd",
      settings.quietHoursEnd,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "excludePresetIds",
      settings.excludePresetIds,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "patterns",
      settings.patterns,
      configurationTarget,
      skippedConfigurationKeys,
    ),
    updateConfigurationValue(
      config,
      "excludePatterns",
      settings.excludePatterns,
      configurationTarget,
      skippedConfigurationKeys,
    ),
  ]);

  await context.globalState.update(settingsStorageKey, settings);
  return { skippedConfigurationKeys };
}

export function createPresetSettings(
  baseSettings: StoredSettings,
  presetId: SettingsPresetId,
  terminalMonitoringSupported = true,
): StoredSettings {
  const base = normalizeStoredSettings(baseSettings);
  const monitorTerminal = terminalMonitoringSupported;

  switch (presetId) {
    case "quiet":
      return {
        ...base,
        enabled: true,
        monitorTerminal,
        monitorDiagnostics: true,
        diagnosticsSeverity: "error",
        terminalDetectionMode: "either",
        cooldownMs: 5000,
        terminalCooldownMs: 4500,
        diagnosticsCooldownMs: 5000,
        volumePercent: 45,
        showVisualNotifications: true,
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      };
    case "aggressive":
      return {
        ...base,
        enabled: true,
        monitorTerminal,
        monitorDiagnostics: true,
        diagnosticsSeverity: "warningAndError",
        terminalDetectionMode: "either",
        cooldownMs: 700,
        terminalCooldownMs: 700,
        diagnosticsCooldownMs: 700,
        volumePercent: 90,
        showVisualNotifications: true,
        quietHoursEnabled: false,
      };
    case "balanced":
    default:
      return {
        ...base,
        enabled: true,
        monitorTerminal,
        monitorDiagnostics: true,
        diagnosticsSeverity: "error",
        terminalDetectionMode: "either",
        cooldownMs: 1500,
        terminalCooldownMs: 1500,
        diagnosticsCooldownMs: 1500,
        volumePercent: 70,
        showVisualNotifications: false,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      };
  }
}
