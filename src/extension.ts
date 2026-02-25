import * as vscode from "vscode";

import { playAlert, resolveSoundPath } from "./audio";
import { commandIds } from "./commands";
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
import { createStatusBarController } from "./status-bar";

const editorDiagnosticsTypingDebounceMs = 700;

export function activate(context: vscode.ExtensionContext): void {
  let storedSettings = loadStoredSettings(context);
  let settings = toRuntimeSettings(storedSettings);
  let soundPath = resolveSoundPath(context);
  let editorTypingDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  const { item: statusBarItem, update: updateStatusBar } = createStatusBarController();

  const clearEditorTypingDebounce = (): void => {
    if (!editorTypingDebounceTimer) return;
    clearTimeout(editorTypingDebounceTimer);
    editorTypingDebounceTimer = undefined;
  };

  const scheduleDebouncedDiagnosticsScan = (): void => {
    clearEditorTypingDebounce();
    editorTypingDebounceTimer = setTimeout(() => {
      editorTypingDebounceTimer = undefined;
      if (!settings.enabled || !settings.monitorDiagnostics) return;
      scanActiveEditorDiagnostics(() => settings, () => soundPath);
    }, editorDiagnosticsTypingDebounceMs);
  };

  const applySettings = async (nextSettings: StoredSettings): Promise<void> => {
    storedSettings = normalizeStoredSettings(nextSettings);
    settings = toRuntimeSettings(storedSettings);
    soundPath = resolveSoundPath(context);
    await persistStoredSettings(context, storedSettings);
    if (!settings.enabled || !settings.monitorDiagnostics) {
      clearEditorTypingDebounce();
    }
    updateStatusBar(settings);
  };
  updateStatusBar(settings);

  const patchSettings = async (patch: Partial<StoredSettings>): Promise<void> => {
    await applySettings({
      ...storedSettings,
      ...patch,
    });
  };

  const startDisposable = vscode.window.onDidStartTerminalShellExecution((event) => {
    if (!settings.enabled || !settings.monitorTerminal) return;
    void monitorExecutionOutput(event.execution, () => settings, () => soundPath);
  });

  const endDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
    if (!settings.enabled || !settings.monitorTerminal) return;
    if (event.exitCode === undefined || event.exitCode === 0) return;
    tryPlayForExecution(event.execution, settings, soundPath);
  });

  const settingsUiDisposable = registerSettingsUiCommand(
    context,
    () => storedSettings,
    applySettings,
    (testSettings) => playAlert(toRuntimeSettings(testSettings), soundPath),
    commandIds.openSettingsUi,
  );

  const playTestSoundDisposable = vscode.commands.registerCommand(commandIds.playTestSound, () => {
    playAlert(settings, soundPath);
  });

  const quickActionsDisposable = vscode.commands.registerCommand(commandIds.showQuickActions, async () => {
    type QuickAction = vscode.QuickPickItem & {
      action:
        | "toggleEnabled"
        | "toggleTerminal"
        | "toggleDiagnostics"
        | "toggleDiagnosticsSeverity"
        | "openSettings"
        | "playTestSound";
    };

    const actions: QuickAction[] = [
      {
        label: settings.enabled ? "Disable Faah" : "Enable Faah",
        description: "Master monitoring switch",
        action: "toggleEnabled",
      },
      {
        label: settings.monitorTerminal ? "Disable Terminal Monitoring" : "Enable Terminal Monitoring",
        description: "Watch shell output for errors",
        action: "toggleTerminal",
      },
      {
        label: settings.monitorDiagnostics
          ? "Disable Editor Diagnostics Monitoring"
          : "Enable Editor Diagnostics Monitoring",
        description: "Watch active-file diagnostics",
        action: "toggleDiagnostics",
      },
      {
        label:
          settings.diagnosticsSeverity === "warningAndError"
            ? "Set Diagnostics Severity: Error Only"
            : "Set Diagnostics Severity: Error + Warning",
        description: "Control which diagnostics can trigger alerts",
        action: "toggleDiagnosticsSeverity",
      },
      {
        label: "Open Faah Settings",
        description: "Open the full settings dashboard",
        action: "openSettings",
      },
      {
        label: "Play Test Sound",
        description: "Verify audio output now",
        action: "playTestSound",
      },
    ];

    const selected = await vscode.window.showQuickPick(actions, {
      placeHolder: "Faah quick actions",
      title: "Faah",
    });
    if (!selected) return;

    switch (selected.action) {
      case "toggleEnabled":
        await patchSettings({ enabled: !storedSettings.enabled });
        break;
      case "toggleTerminal":
        await patchSettings({ monitorTerminal: !storedSettings.monitorTerminal });
        break;
      case "toggleDiagnostics":
        await patchSettings({ monitorDiagnostics: !storedSettings.monitorDiagnostics });
        break;
      case "toggleDiagnosticsSeverity":
        await patchSettings({
          diagnosticsSeverity:
            storedSettings.diagnosticsSeverity === "warningAndError" ? "error" : "warningAndError",
        });
        break;
      case "openSettings":
        await vscode.commands.executeCommand(commandIds.openSettingsUi);
        break;
      case "playTestSound":
        await vscode.commands.executeCommand(commandIds.playTestSound);
        break;
      default:
        break;
    }
  });

  const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
    if (!settings.enabled || !settings.monitorDiagnostics) return;
    if (editorTypingDebounceTimer) return;
    onDiagnosticsChanged(event, () => settings, () => soundPath);
  });

  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    if (!settings.enabled || !settings.monitorDiagnostics) return;
    clearEditorTypingDebounce();
    scanActiveEditorDiagnostics(() => settings, () => soundPath);
  });

  const textDocumentDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (!settings.enabled || !settings.monitorDiagnostics) return;
    if (event.contentChanges.length === 0) return;

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    if (event.document.uri.toString() !== activeEditor.document.uri.toString()) return;

    scheduleDebouncedDiagnosticsScan();
  });

  scanActiveEditorDiagnostics(() => settings, () => soundPath);

  context.subscriptions.push(
    startDisposable,
    endDisposable,
    settingsUiDisposable,
    playTestSoundDisposable,
    quickActionsDisposable,
    diagnosticsDisposable,
    activeEditorDisposable,
    textDocumentDisposable,
    { dispose: clearEditorTypingDebounce },
    statusBarItem,
  );
}

export function deactivate(): void {}
