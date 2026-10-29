import * as vscode from "vscode";

import {
  getAlertSuppressionReason,
  getRemainingPlaybackCooldownMs,
  tryAcquirePlaybackWindow,
} from "./alert-gate";
import { triggerAlert } from "./alert-dispatch";
import type { RuntimeSettings } from "./settings";

const lastFingerprintByUri = new Map<string, string>();
const retryTimerByUri = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_TRACKED_FINGERPRINTS = 256;

function normalizeDiagnosticCode(code: vscode.Diagnostic["code"]): string {
  if (typeof code === "string" || typeof code === "number") return String(code);
  if (!code) return "";
  return String(code.value);
}

function isDiagnosticSeverityAllowed(
  severity: vscode.DiagnosticSeverity,
  mode: RuntimeSettings["diagnosticsSeverity"],
): boolean {
  if (severity === vscode.DiagnosticSeverity.Error) return true;
  if (
    mode === "warningAndError" &&
    severity === vscode.DiagnosticSeverity.Warning
  )
    return true;
  return false;
}

function isDiagnosticExcluded(
  diagnostic: vscode.Diagnostic,
  excludePatterns: readonly RegExp[],
): boolean {
  return excludePatterns.some((pattern) => pattern.test(diagnostic.message));
}

function serializeDiagnostic(diagnostic: vscode.Diagnostic): string {
  const code = normalizeDiagnosticCode(diagnostic.code);
  const source = diagnostic.source ?? "";
  return `${source}|${code}|${diagnostic.message}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function createMonitoredDiagnosticsFingerprint(
  uri: vscode.Uri,
  settings: RuntimeSettings,
): string | null {
  const monitoredDiagnostics = vscode.languages
    .getDiagnostics(uri)
    .filter((diagnostic) =>
      isDiagnosticSeverityAllowed(
        diagnostic.severity,
        settings.diagnosticsSeverity,
      ),
    )
    .filter(
      (diagnostic) =>
        !isDiagnosticExcluded(diagnostic, settings.excludePatterns),
    );

  if (monitoredDiagnostics.length === 0) return null;

  const parts = monitoredDiagnostics
    .map((diagnostic) => hashString(serializeDiagnostic(diagnostic)))
    .sort();

  return hashString(parts.join(","));
}

function clearRetry(uriKey: string): void {
  const existingTimer = retryTimerByUri.get(uriKey);
  if (!existingTimer) return;
  clearTimeout(existingTimer);
  retryTimerByUri.delete(uriKey);
}

function scheduleRetry(
  uriKey: string,
  delayMs: number,
  getSettings: () => RuntimeSettings,
  getSoundPath: () => string,
): void {
  if (retryTimerByUri.has(uriKey)) return;

  const timer = setTimeout(
    () => {
      retryTimerByUri.delete(uriKey);
      scanActiveEditorDiagnostics(getSettings, getSoundPath);
    },
    Math.max(50, delayMs),
  );

  retryTimerByUri.set(uriKey, timer);
}

function rememberFingerprint(uriKey: string, fingerprint: string): void {
  if (
    !lastFingerprintByUri.has(uriKey) &&
    lastFingerprintByUri.size >= MAX_TRACKED_FINGERPRINTS
  ) {
    const oldestKey = lastFingerprintByUri.keys().next().value;
    if (oldestKey !== undefined) lastFingerprintByUri.delete(oldestKey);
  }
  lastFingerprintByUri.set(uriKey, fingerprint);
}

function tryPlayForEditor(
  editor: vscode.TextEditor | undefined,
  getSettings: () => RuntimeSettings,
  getSoundPath: () => string,
): void {
  const settings = getSettings();
  if (!editor || !settings.enabled || !settings.monitorDiagnostics) return;
  if (getAlertSuppressionReason(settings) !== null) return;

  const uri = editor.document.uri;
  const uriKey = uri.toString();

  const remainingCooldownMs = getRemainingPlaybackCooldownMs(
    settings.diagnosticsCooldownMs,
    "diagnostics",
  );
  if (remainingCooldownMs > 0) {
    scheduleRetry(uriKey, remainingCooldownMs + 30, getSettings, getSoundPath);
    return;
  }

  const nextFingerprint = createMonitoredDiagnosticsFingerprint(uri, settings);
  const previousFingerprint = lastFingerprintByUri.get(uriKey) ?? null;

  if (!nextFingerprint) {
    lastFingerprintByUri.delete(uriKey);
    clearRetry(uriKey);
    return;
  }

  if (nextFingerprint === previousFingerprint) {
    clearRetry(uriKey);
    return;
  }

  if (
    !tryAcquirePlaybackWindow(settings.diagnosticsCooldownMs, "diagnostics")
  ) {
    scheduleRetry(uriKey, 80, getSettings, getSoundPath);
    return;
  }

  clearRetry(uriKey);
  rememberFingerprint(uriKey, nextFingerprint);
  triggerAlert("diagnostics", settings, getSoundPath());
}

export function scanActiveEditorDiagnostics(
  getSettings: () => RuntimeSettings,
  getSoundPath: () => string,
): void {
  tryPlayForEditor(vscode.window.activeTextEditor, getSettings, getSoundPath);
}

export function onDiagnosticsChanged(
  event: vscode.DiagnosticChangeEvent,
  getSettings: () => RuntimeSettings,
  getSoundPath: () => string,
): void {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return;

  const activeUri = activeEditor.document.uri.toString();
  if (!event.uris.some((uri) => uri.toString() === activeUri)) return;

  tryPlayForEditor(activeEditor, getSettings, getSoundPath);
}

export function clearDiagnosticsRetryTimers(): void {
  for (const timer of retryTimerByUri.values()) {
    clearTimeout(timer);
  }
  retryTimerByUri.clear();
}

export function disposeDiagnosticsMonitorState(): void {
  clearDiagnosticsRetryTimers();
  lastFingerprintByUri.clear();
}
