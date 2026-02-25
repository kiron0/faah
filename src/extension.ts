import * as vscode from "vscode";

import { playAlert, resolveSoundPath } from "./audio";
import { onDiagnosticsChanged, scanActiveEditorDiagnostics } from "./diagnostics-monitor";
import { monitorExecutionOutput, tryPlayForExecution } from "./execution-monitor";
import { registerSettingsUiCommand } from "./settings-webview";
import {
  loadStoredSettings,
  normalizeStoredSettings,
  persistStoredSettings,
  type StoredSettings,
  toRuntimeSettings,
} from "./settings";

export function activate(context: vscode.ExtensionContext): void {
  let storedSettings = loadStoredSettings(context);
  let settings = toRuntimeSettings(storedSettings);
  let soundPath = resolveSoundPath(context);

  const applySettings = async (nextSettings: StoredSettings): Promise<void> => {
    storedSettings = normalizeStoredSettings(nextSettings);
    settings = toRuntimeSettings(storedSettings);
    soundPath = resolveSoundPath(context);
    await persistStoredSettings(context, storedSettings);
  };

  const startDisposable = vscode.window.onDidStartTerminalShellExecution((event) => {
    if (!settings.enabled) return;
    void monitorExecutionOutput(event.execution, () => settings, () => soundPath);
  });

  const endDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
    if (!settings.enabled) return;
    if (event.exitCode === undefined || event.exitCode === 0) return;
    tryPlayForExecution(event.execution, settings, soundPath);
  });

  const settingsUiDisposable = registerSettingsUiCommand(
    context,
    () => storedSettings,
    applySettings,
    (testSettings) => playAlert(toRuntimeSettings(testSettings), soundPath),
  );

  const testSoundDisposable = vscode.commands.registerCommand(
    "terminalErrorSound.playTestSound",
    () => {
      playAlert(settings, soundPath);
    },
  );

  const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
    onDiagnosticsChanged(event, () => settings, () => soundPath);
  });

  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    scanActiveEditorDiagnostics(() => settings, () => soundPath);
  });

  scanActiveEditorDiagnostics(() => settings, () => soundPath);

  context.subscriptions.push(
    startDisposable,
    endDisposable,
    settingsUiDisposable,
    testSoundDisposable,
    diagnosticsDisposable,
    activeEditorDisposable,
  );
}

export function deactivate(): void {}
