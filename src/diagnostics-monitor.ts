import * as vscode from "vscode";

import { tryAcquirePlaybackWindow } from "./alert-gate";
import { playAlert } from "./audio";
import type { RuntimeSettings } from "./settings";

const lastFingerprintByUri = new Map<string, string>();

function normalizeDiagnosticCode(code: vscode.Diagnostic["code"]): string {
  if (typeof code === "string" || typeof code === "number") return String(code);
  if (!code) return "";
  return String(code.value);
}

function getErrorFingerprint(uri: vscode.Uri): string | null {
  const errors = vscode.languages
    .getDiagnostics(uri)
    .filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error);

  if (errors.length === 0) return null;

  return errors
    .map((diagnostic) => {
      const code = normalizeDiagnosticCode(diagnostic.code);
      const source = diagnostic.source ?? "";
      const range = `${diagnostic.range.start.line}:${diagnostic.range.start.character}-${diagnostic.range.end.line}:${diagnostic.range.end.character}`;
      return `${source}|${code}|${range}|${diagnostic.message}`;
    })
    .sort()
    .join("\n");
}

function tryPlayForEditor(
  editor: vscode.TextEditor | undefined,
  settings: RuntimeSettings,
  soundPath: string,
): void {
  if (!editor || !settings.enabled) return;

  const uri = editor.document.uri;
  const uriKey = uri.toString();
  const nextFingerprint = getErrorFingerprint(uri);
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
