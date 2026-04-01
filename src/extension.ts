import * as vscode from "vscode";

import {
  clearSnoozeAlerts,
  getSnoozeRemainingMs,
  snoozeAlertsForMs,
} from "./alert-gate";
import { playAlert, resolveSoundPath } from "./audio";
import { commandIds } from "./commands";
import {
  disposeDiagnosticsMonitorState,
  onDiagnosticsChanged,
  scanActiveEditorDiagnostics,
} from "./diagnostics-monitor";
import {
  monitorExecutionOutput,
  tryPlayForExecution,
} from "./execution-monitor";
import {
  getTerminalShellExecutionApi,
  isExecutionIdentity,
  isTerminalExecutionLike,
} from "./terminal-shell-integration";
import { registerSettingsUiCommand } from "./settings-webview";
import {
  isValidQuietHoursTime,
  loadStoredSettings,
  normalizeStoredSettings,
  persistStoredSettings,
  type SettingsPersistTarget,
  type StoredSettings,
  toRuntimeSettings,
} from "./settings";
import { createStatusBarController } from "./status-bar";

const editorDiagnosticsTypingDebounceMs = 700;
const statusRefreshIntervalMs = 15_000;
const onboardingStateKey = "faah.onboarding.seenVersion";

type SnoozeAction = {
  durationMinutes: number;
  label: string;
};

const snoozeActions: SnoozeAction[] = [
  { durationMinutes: 15, label: "15 minutes" },
  { durationMinutes: 30, label: "30 minutes" },
  { durationMinutes: 60, label: "1 hour" },
  { durationMinutes: 120, label: "2 hours" },
];

function formatTime(dateMs: number): string {
  return new Date(dateMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function activate(context: vscode.ExtensionContext): void {
  let storedSettings = loadStoredSettings(context);
  let settings = toRuntimeSettings(storedSettings);
  let soundPath = resolveSoundPath(context, storedSettings);
  let editorTypingDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let statusRefreshTimer: ReturnType<typeof setInterval> | undefined;
  const { item: statusBarItem, update: updateStatusBar } =
    createStatusBarController();
  const terminalShellExecutionApi = getTerminalShellExecutionApi();
  const terminalMonitoringSupported = terminalShellExecutionApi !== null;

  if (!terminalMonitoringSupported) {
    console.info(
      "[faah] Terminal shell execution APIs are unavailable in this host. Terminal monitoring is disabled for this session.",
    );
  }

  const clearEditorTypingDebounce = (): void => {
    if (!editorTypingDebounceTimer) return;
    clearTimeout(editorTypingDebounceTimer);
    editorTypingDebounceTimer = undefined;
  };

  const clearStatusRefreshTimer = (): void => {
    if (!statusRefreshTimer) return;
    clearInterval(statusRefreshTimer);
    statusRefreshTimer = undefined;
  };

  const syncStatusBar = (): void => {
    const snoozeRemainingMs = getSnoozeRemainingMs();
    updateStatusBar(settings, {
      snoozeRemainingMs,
      terminalMonitoringSupported,
    });

    if (snoozeRemainingMs > 0 && !statusRefreshTimer) {
      statusRefreshTimer = setInterval(() => {
        updateStatusBar(settings, {
          snoozeRemainingMs: getSnoozeRemainingMs(),
          terminalMonitoringSupported,
        });
      }, statusRefreshIntervalMs);
      return;
    }

    if (snoozeRemainingMs <= 0) {
      clearStatusRefreshTimer();
    }
  };

  const scheduleDebouncedDiagnosticsScan = (): void => {
    clearEditorTypingDebounce();
    editorTypingDebounceTimer = setTimeout(() => {
      editorTypingDebounceTimer = undefined;
      if (!settings.enabled || !settings.monitorDiagnostics) return;
      scanActiveEditorDiagnostics(
        () => settings,
        () => soundPath,
      );
    }, editorDiagnosticsTypingDebounceMs);
  };

  const applySettings = async (
    nextSettings: StoredSettings,
    persistTarget: SettingsPersistTarget = "auto",
  ): Promise<void> => {
    storedSettings = normalizeStoredSettings(nextSettings);
    settings = toRuntimeSettings(storedSettings);
    soundPath = resolveSoundPath(context, storedSettings);
    await persistStoredSettings(context, storedSettings, persistTarget);
    if (!settings.enabled || !settings.monitorDiagnostics) {
      clearEditorTypingDebounce();
    }
    syncStatusBar();
  };

  const reloadSettingsFromConfiguration = (): void => {
    storedSettings = loadStoredSettings(context);
    settings = toRuntimeSettings(storedSettings);
    soundPath = resolveSoundPath(context, storedSettings);
    syncStatusBar();
  };
  syncStatusBar();

  const patchSettings = async (
    patch: Partial<StoredSettings>,
  ): Promise<void> => {
    await applySettings({
      ...storedSettings,
      ...patch,
    });
  };

  const showCompatibilityStatus = (): void => {
    const hostName = vscode.env.appName || "This editor";
    const hostVersion = vscode.version;
    const baseMessage = `${hostName} reports VS Code API ${hostVersion}.`;

    if (terminalMonitoringSupported) {
      void vscode.window.showInformationMessage(
        `${baseMessage} Faah diagnostics and terminal monitoring are available.`,
      );
      return;
    }

    void vscode.window.showWarningMessage(
      `${baseMessage} Faah diagnostics monitoring is available, but terminal monitoring is not supported in this host.`,
    );
  };

  const startDisposable =
    terminalShellExecutionApi?.onDidStartTerminalShellExecution?.((event) => {
      if (!settings.enabled || !settings.monitorTerminal) return;
      if (!isTerminalExecutionLike(event.execution)) return;
      void monitorExecutionOutput(
        event.execution,
        () => settings,
        () => soundPath,
      );
    });

  const endDisposable =
    terminalShellExecutionApi?.onDidEndTerminalShellExecution?.((event) => {
      if (!settings.enabled || !settings.monitorTerminal) return;
      if (event.exitCode === undefined || event.exitCode === 0) return;
      if (!isExecutionIdentity(event.execution)) return;
      tryPlayForExecution(event.execution, settings, soundPath);
    });

  const settingsUiDisposable = registerSettingsUiCommand(
    context,
    () => storedSettings,
    applySettings,
    (testSettings) =>
      playAlert(
        toRuntimeSettings(testSettings),
        resolveSoundPath(context, testSettings),
      ),
    terminalMonitoringSupported,
    commandIds.openSettingsUi,
  );

  const playTestSoundDisposable = vscode.commands.registerCommand(
    commandIds.playTestSound,
    () => {
      playAlert(settings, soundPath);
    },
  );

  const showCompatibilityStatusDisposable = vscode.commands.registerCommand(
    commandIds.showCompatibilityStatus,
    showCompatibilityStatus,
  );

  const snoozeDisposable = vscode.commands.registerCommand(
    commandIds.snoozeAlerts,
    async () => {
      const clearLabel = "Clear Snooze";
      const options: vscode.QuickPickItem[] = [
        ...snoozeActions.map((action) => ({
          label: `Snooze for ${action.label}`,
          description: "Temporarily silence alerts",
        })),
        {
          label: clearLabel,
          description: "Resume alerts immediately",
        },
      ];

      const selected = await vscode.window.showQuickPick(options, {
        title: "Faah Snooze",
        placeHolder: "Choose a snooze duration",
      });
      if (!selected) return;

      if (selected.label === clearLabel) {
        clearSnoozeAlerts();
        syncStatusBar();
        vscode.window.showInformationMessage("Faah snooze cleared.");
        return;
      }

      const chosenAction = snoozeActions.find(
        (action) => selected.label === `Snooze for ${action.label}`,
      );
      if (!chosenAction) return;

      const snoozeUntil = snoozeAlertsForMs(
        chosenAction.durationMinutes * 60_000,
      );
      syncStatusBar();
      vscode.window.showInformationMessage(
        `Faah alerts snoozed for ${chosenAction.label} (until ${formatTime(snoozeUntil)}).`,
      );
    },
  );

  const clearSnoozeDisposable = vscode.commands.registerCommand(
    commandIds.clearSnooze,
    () => {
      clearSnoozeAlerts();
      syncStatusBar();
      vscode.window.showInformationMessage("Faah snooze cleared.");
    },
  );

  const quietHoursDisposable = vscode.commands.registerCommand(
    commandIds.setQuietHours,
    async () => {
      const selected = await vscode.window.showQuickPick(
        [
          {
            label: "Disable Quiet Hours",
            description: "Alerts can play any time",
            action: "disable" as const,
          },
          {
            label: "22:00 - 07:00",
            description: "Default overnight quiet hours",
            action: "preset-night" as const,
          },
          {
            label: "00:00 - 06:00",
            description: "Late-night quiet hours",
            action: "preset-midnight" as const,
          },
          {
            label: "Custom Range",
            description: "Enter start/end times in 24h format",
            action: "custom" as const,
          },
        ],
        {
          title: "Faah Quiet Hours",
          placeHolder: "Choose quiet hours behavior",
        },
      );
      if (!selected) return;

      if (selected.action === "disable") {
        await patchSettings({ quietHoursEnabled: false });
        vscode.window.showInformationMessage("Faah quiet hours disabled.");
        return;
      }

      if (selected.action === "preset-night") {
        await patchSettings({
          quietHoursEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        });
        vscode.window.showInformationMessage(
          "Faah quiet hours set to 22:00 - 07:00.",
        );
        return;
      }

      if (selected.action === "preset-midnight") {
        await patchSettings({
          quietHoursEnabled: true,
          quietHoursStart: "00:00",
          quietHoursEnd: "06:00",
        });
        vscode.window.showInformationMessage(
          "Faah quiet hours set to 00:00 - 06:00.",
        );
        return;
      }

      const start = await vscode.window.showInputBox({
        prompt: "Quiet hours start (24h HH:mm)",
        placeHolder: "22:00",
        value: storedSettings.quietHoursStart,
        validateInput: (value) =>
          isValidQuietHoursTime(value.trim())
            ? null
            : "Use 24h time format HH:mm",
      });
      if (start === undefined) return;

      const end = await vscode.window.showInputBox({
        prompt: "Quiet hours end (24h HH:mm)",
        placeHolder: "07:00",
        value: storedSettings.quietHoursEnd,
        validateInput: (value) =>
          isValidQuietHoursTime(value.trim())
            ? null
            : "Use 24h time format HH:mm",
      });
      if (end === undefined) return;

      await patchSettings({
        quietHoursEnabled: true,
        quietHoursStart: start.trim(),
        quietHoursEnd: end.trim(),
      });
      vscode.window.showInformationMessage(
        `Faah quiet hours set to ${start.trim()} - ${end.trim()}.`,
      );
    },
  );

  const quickActionsDisposable = vscode.commands.registerCommand(
    commandIds.showQuickActions,
    async () => {
      type QuickAction = vscode.QuickPickItem & {
        action:
          | "toggleEnabled"
          | "toggleTerminal"
          | "toggleDiagnostics"
          | "toggleDiagnosticsSeverity"
          | "snooze"
          | "clearSnooze"
          | "setQuietHours"
          | "openSettings"
          | "showCompatibility"
          | "playTestSound";
      };

      const snoozeRemainingMs = getSnoozeRemainingMs();
      const terminalMonitoringDescription = terminalMonitoringSupported
        ? "Watch shell output for errors"
        : "Unavailable in this Cursor/VS Code version";
      const actions: QuickAction[] = [
        {
          label: settings.enabled ? "Disable Faah" : "Enable Faah",
          description: "Master monitoring switch",
          action: "toggleEnabled",
        },
        {
          label: terminalMonitoringSupported
            ? settings.monitorTerminal
              ? "Disable Terminal Monitoring"
              : "Enable Terminal Monitoring"
            : "Terminal Monitoring Unavailable",
          description: terminalMonitoringDescription,
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
          label: "Snooze Alerts",
          description: "Temporarily silence all alerts",
          action: "snooze",
        },
        ...(snoozeRemainingMs > 0
          ? [
              {
                label: "Clear Snooze",
                description: "Resume alerts immediately",
                action: "clearSnooze" as const,
              },
            ]
          : []),
        {
          label: settings.quietHoursEnabled
            ? `Update Quiet Hours (${settings.quietHoursStart} - ${settings.quietHoursEnd})`
            : "Enable Quiet Hours",
          description: "Set overnight quiet window",
          action: "setQuietHours",
        },
        {
          label: "Open Faah Settings",
          description: "Open the full settings dashboard",
          action: "openSettings",
        },
        {
          label: "Show Compatibility Status",
          description: "Check editor host support for terminal monitoring",
          action: "showCompatibility",
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
          if (!terminalMonitoringSupported) {
            vscode.window.showInformationMessage(
              "Faah terminal monitoring is unavailable in this Cursor/VS Code version.",
            );
            break;
          }
          await patchSettings({
            monitorTerminal: !storedSettings.monitorTerminal,
          });
          break;
        case "toggleDiagnostics":
          await patchSettings({
            monitorDiagnostics: !storedSettings.monitorDiagnostics,
          });
          break;
        case "toggleDiagnosticsSeverity":
          await patchSettings({
            diagnosticsSeverity:
              storedSettings.diagnosticsSeverity === "warningAndError"
                ? "error"
                : "warningAndError",
          });
          break;
        case "snooze":
          await vscode.commands.executeCommand(commandIds.snoozeAlerts);
          break;
        case "clearSnooze":
          await vscode.commands.executeCommand(commandIds.clearSnooze);
          break;
        case "setQuietHours":
          await vscode.commands.executeCommand(commandIds.setQuietHours);
          break;
        case "openSettings":
          await vscode.commands.executeCommand(commandIds.openSettingsUi);
          break;
        case "showCompatibility":
          await vscode.commands.executeCommand(
            commandIds.showCompatibilityStatus,
          );
          break;
        case "playTestSound":
          await vscode.commands.executeCommand(commandIds.playTestSound);
          break;
        default:
          break;
      }
    },
  );

  const diagnosticsDisposable = vscode.languages.onDidChangeDiagnostics(
    (event) => {
      if (!settings.enabled || !settings.monitorDiagnostics) return;
      if (editorTypingDebounceTimer) return;
      onDiagnosticsChanged(
        event,
        () => settings,
        () => soundPath,
      );
    },
  );

  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
    () => {
      if (!settings.enabled || !settings.monitorDiagnostics) return;
      clearEditorTypingDebounce();
      scanActiveEditorDiagnostics(
        () => settings,
        () => soundPath,
      );
    },
  );

  const textDocumentDisposable = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (!settings.enabled || !settings.monitorDiagnostics) return;
      if (event.contentChanges.length === 0) return;

      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) return;
      if (
        event.document.uri.toString() !== activeEditor.document.uri.toString()
      )
        return;

      scheduleDebouncedDiagnosticsScan();
    },
  );

  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (!event.affectsConfiguration("faah")) return;
      reloadSettingsFromConfiguration();
    },
  );

  scanActiveEditorDiagnostics(
    () => settings,
    () => soundPath,
  );

  context.subscriptions.push(
    settingsUiDisposable,
    playTestSoundDisposable,
    showCompatibilityStatusDisposable,
    snoozeDisposable,
    clearSnoozeDisposable,
    quietHoursDisposable,
    quickActionsDisposable,
    diagnosticsDisposable,
    activeEditorDisposable,
    textDocumentDisposable,
    configChangeDisposable,
    { dispose: clearEditorTypingDebounce },
    { dispose: clearStatusRefreshTimer },
    { dispose: disposeDiagnosticsMonitorState },
    statusBarItem,
  );

  if (startDisposable) {
    context.subscriptions.push(startDisposable);
  }

  if (endDisposable) {
    context.subscriptions.push(endDisposable);
  }

  queueMicrotask(() => {
    void (async () => {
      const currentVersion = String(
        context.extension.packageJSON.version ?? "unknown",
      );
      const seenVersion = context.globalState.get<string>(onboardingStateKey);
      if (seenVersion === currentVersion) return;

      await context.globalState.update(onboardingStateKey, currentVersion);

      const onboardingMessage = terminalMonitoringSupported
        ? "Faah is ready. Diagnostics and terminal monitoring are available in this host."
        : "Faah is ready. Diagnostics monitoring is available, but terminal monitoring is unavailable in this host.";
      const selection = await vscode.window.showInformationMessage(
        onboardingMessage,
        "Open Settings",
        "Play Test Sound",
        "Show Compatibility",
      );

      if (selection === "Open Settings") {
        await vscode.commands.executeCommand(commandIds.openSettingsUi);
        return;
      }

      if (selection === "Play Test Sound") {
        await vscode.commands.executeCommand(commandIds.playTestSound);
        return;
      }

      if (selection === "Show Compatibility") {
        await vscode.commands.executeCommand(
          commandIds.showCompatibilityStatus,
        );
      }
    })();
  });
}

export function deactivate(): void {}
