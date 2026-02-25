import * as vscode from "vscode";

import { tryAcquirePlaybackWindow } from "./alert-gate";
import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

const lastFingerprintByUri = new Map<string, string>();
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

function tryPlayForEditor(
  editor: vscode.TextEditor | undefined,
  settings: RuntimeSettings,
  soundPath: string,
): void {
  if (!editor || !settings.enabled || !settings.monitorDiagnostics) return;

  const uri = editor.document.uri;
  const uriKey = uri.toString();
  const nextFingerprint = createMonitoredDiagnosticsFingerprint(uri, settings);
  const previousFingerprint = lastFingerprintByUri.get(uriKey) ?? null;

  if (!nextFingerprint) {
    lastFingerprintByUri.delete(uriKey);
    return;
  }

  if (nextFingerprint === previousFingerprint) return;
  if (!tryAcquirePlaybackWindow(settings.cooldownMs)) return;

  lastFingerprintByUri.set(uriKey, nextFingerprint);
  playAlert(settings, soundPath);
}

export function scanActiveEditorDiagnostics(
  getSettings: () => RuntimeSettings,
  getSoundPath: () => string,
): void {
  tryPlayForEditor(vscode.window.activeTextEditor, getSettings(), getSoundPath());
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

  tryPlayForEditor(activeEditor, getSettings(), getSoundPath());
}
