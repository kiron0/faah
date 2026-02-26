import * as vscode from "vscode";

import {
  getAlertSuppressionReason,
  getRemainingPlaybackCooldownMs,
  tryAcquirePlaybackWindow,
} from "./alert-gate";
import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

const lastFingerprintByUri = new Map<string, string>();
const retryTimerByUri = new Map<string, ReturnType<typeof setTimeout>>();
const FINGERPRINT_LINE_SEPARATOR = "\n";

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
  if (mode === "warningAndError" && severity === vscode.DiagnosticSeverity.Warning) return true;
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
  const range =
    `${diagnostic.range.start.line}:${diagnostic.range.start.character}` +
    `-${diagnostic.range.end.line}:${diagnostic.range.end.character}`;
  return `${source}|${code}|${range}|${diagnostic.message}`;
}

function createMonitoredDiagnosticsFingerprint(uri: vscode.Uri, settings: RuntimeSettings): string | null {
  const monitoredDiagnostics = vscode.languages
    .getDiagnostics(uri)
    .filter((diagnostic) =>
      isDiagnosticSeverityAllowed(diagnostic.severity, settings.diagnosticsSeverity),
    )
    .filter((diagnostic) => !isDiagnosticExcluded(diagnostic, settings.excludePatterns));

  if (monitoredDiagnostics.length === 0) return null;

  return monitoredDiagnostics.map(serializeDiagnostic).sort().join(FINGERPRINT_LINE_SEPARATOR);
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

  const timer = setTimeout(() => {
    retryTimerByUri.delete(uriKey);
    scanActiveEditorDiagnostics(getSettings, getSoundPath);
  }, Math.max(50, delayMs));
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  retryTimerByUri.set(uriKey, timer);
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

  const remainingCooldownMs = getRemainingPlaybackCooldownMs(
    settings.diagnosticsCooldownMs,
    "diagnostics",
  );
  if (remainingCooldownMs > 0) {
    scheduleRetry(uriKey, remainingCooldownMs + 30, getSettings, getSoundPath);
    return;
  }
  if (!tryAcquirePlaybackWindow(settings.diagnosticsCooldownMs, "diagnostics")) {
    scheduleRetry(uriKey, 80, getSettings, getSoundPath);
    return;
  }

  clearRetry(uriKey);
  lastFingerprintByUri.set(uriKey, nextFingerprint);
  playAlert(settings, getSoundPath());
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

export function disposeDiagnosticsMonitorState(): void {
  for (const timer of retryTimerByUri.values()) {
    clearTimeout(timer);
  }
  retryTimerByUri.clear();
  lastFingerprintByUri.clear();
}
