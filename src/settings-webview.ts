import * as fs from "fs/promises";
import * as vscode from "vscode";

import { commandIds } from "./commands";
import {
  createPresetSettings,
  defaultStoredSettings,
  excludePatternPresetDefinitions,
  type PersistStoredSettingsResult,
  normalizeStoredSettings,
  type SettingsPersistTarget,
  type SettingsPresetId,
  type StoredSettings,
} from "./settings";
import type { TerminalMonitoringCapability } from "./terminal-shell-integration";

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export const saveTargetStorageKey = "faah.settings.saveTarget.v1";
const validPresetIds = new Set<SettingsPresetId>([
  "balanced",
  "quiet",
  "aggressive",
]);

function normalizeSaveTarget(
  value: unknown,
  hasWorkspace: boolean,
): SettingsPersistTarget {
  return value === "workspace" && hasWorkspace ? "workspace" : "global";
}

async function rememberSaveTarget(
  context: vscode.ExtensionContext,
  target: SettingsPersistTarget,
): Promise<void> {
  if (typeof context.globalState?.update !== "function") return;

  try {
    await context.globalState.update(saveTargetStorageKey, target);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[faah] Failed to remember save target: ${message}`);
  }
}

function renderSettingsWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  settings: StoredSettings,
  hasWorkspace: boolean,
  terminalMonitoringCapability: TerminalMonitoringCapability,
  initialSaveTarget: SettingsPersistTarget = "global",
): string {
  const nonce = getNonce();
  const iconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "images", "icon.png"),
  );
  const bootSettings = JSON.stringify(settings).replace(/</g, "\\u003c");
  const terminalMonitoringSupported = terminalMonitoringCapability !== "none";
  const selectedSaveTarget = normalizeSaveTarget(
    initialSaveTarget,
    hasWorkspace,
  );
  const terminalStatusMessage =
    terminalMonitoringCapability === "full"
      ? "Terminal monitoring is fully available in this host."
      : terminalMonitoringCapability === "exitCodeOnly"
        ? "Terminal monitoring has partial host support here. Non-zero exit-code alerts work, but output-stream monitoring is unavailable."
        : terminalMonitoringCapability === "outputOnly"
          ? "Terminal monitoring has partial host support here. Output-stream alerts work, but non-zero exit-code monitoring is unavailable."
          : "Terminal monitoring is unavailable in this host. Diagnostics alerts still work normally.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>Faah Settings</title>
  <link rel="icon" type="image/png" href="${iconUri}" />
  <style>
    :root {
      --bg-1: #07111e;
      --bg-2: #0f1f2f;
      --panel: rgba(10, 20, 34, 0.9);
      --card: rgba(15, 31, 47, 0.92);
      --line: rgba(255, 255, 255, 0.1);
      --text: #e6f0ff;
      --muted: #8ea2b8;
      --accent: #16c8a8;
      --accent-2: #5bb6ff;
      --danger: #ff6f6f;
      --input-bg: rgba(5, 13, 24, 0.7);
      --input-border: rgba(255, 255, 255, 0.15);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(70rem 35rem at -10% -20%, rgba(91, 182, 255, 0.2), transparent 60%),
        radial-gradient(70rem 35rem at 110% 120%, rgba(22, 200, 168, 0.18), transparent 60%),
        linear-gradient(130deg, var(--bg-1), var(--bg-2));
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      padding: 20px 12px;
    }

    .wrap {
      width: min(1200px, calc(100vw - 24px));
      max-width: none;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }

    .hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(100deg, rgba(91, 182, 255, 0.08), rgba(22, 200, 168, 0.05));
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand img {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    h1 {
      margin: 0;
      font-size: 1.15rem;
      letter-spacing: 0.1px;
      font-weight: 600;
    }

    .hero p {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 0.85rem;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid rgba(91, 182, 255, 0.25);
      color: #d9edff;
      font-size: 0.78rem;
      background: rgba(91, 182, 255, 0.1);
      white-space: normal;
      max-width: min(60ch, 100%);
      line-height: 1.35;
    }

    .pill.error {
      border-color: rgba(255, 111, 111, 0.35);
      color: #ffd8d8;
      background: rgba(255, 111, 111, 0.1);
    }

    .pill.warn {
      border-color: rgba(255, 208, 117, 0.35);
      color: #ffefc9;
      background: rgba(255, 208, 117, 0.1);
    }

    .grid {
      padding: 16px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--card);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card.full {
      grid-column: 1 / -1;
    }

    .card.notice {
      background: linear-gradient(120deg, rgba(255, 208, 117, 0.08), rgba(91, 182, 255, 0.05));
      border-color: rgba(255, 208, 117, 0.18);
    }

    label {
      display: block;
      font-weight: 600;
      font-size: 0.88rem;
      color: #ffffff;
      margin: 0;
    }

    .hint {
      color: var(--muted);
      font-size: 0.8rem;
      line-height: 1.35;
      margin: 0;
    }

    input[type="text"],
    input[type="number"],
    input[type="time"],
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--input-border);
      background: var(--input-bg);
      color: var(--text);
      border-radius: 6px;
      padding: 7px 10px;
      outline: none;
      font: inherit;
      font-size: 0.88rem;
      transition: border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
    }

    input[type="text"]:hover,
    input[type="number"]:hover,
    input[type="time"]:hover,
    select:hover,
    textarea:hover {
      border-color: rgba(255, 255, 255, 0.28);
      background: rgba(5, 13, 24, 0.8);
    }

    input:focus, select:focus, textarea:focus {
      border-color: var(--accent-2);
      background: rgba(5, 13, 24, 0.85);
      box-shadow: 0 0 0 3px rgba(91, 182, 255, 0.18);
    }

    select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238ea2b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 14px;
      padding-right: 32px;
    }

    textarea {
      min-height: 100px;
      max-height: 200px;
      resize: vertical;
      overflow-y: auto;
      line-height: 1.4;
    }

    .pattern-list {
      margin: 0;
      padding: 8px 12px 8px 24px;
      border: 1px solid var(--input-border);
      background: rgba(4, 10, 20, 0.7);
      color: rgba(230, 240, 255, 0.85);
      border-radius: 6px;
      max-height: 180px;
      overflow-y: auto;
      line-height: 1.4;
    }

    .pattern-list li + li {
      margin-top: 4px;
    }

    .pattern-list code {
      color: inherit;
      background: transparent;
      font-size: 0.8rem;
      font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      word-break: break-word;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .row > div {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .switch {
      position: relative;
      width: 44px;
      height: 24px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      transition: background 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms ease;
      flex-shrink: 0;
      padding: 0;
    }

    .switch span {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ffffff;
      transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }

    .switch.on {
      background: rgba(22, 200, 168, 0.4);
      border-color: rgba(22, 200, 168, 0.7);
    }

    .switch.on span {
      transform: translateX(20px);
    }

    .volume-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.15);
      outline: none;
      margin: 8px 0;
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      transition: transform 100ms ease, background-color 100ms ease;
    }

    input[type="range"]::-webkit-slider-thumb:hover {
      background: var(--accent-2);
      transform: scale(1.15);
    }

    .value-badge {
      min-width: 60px;
      text-align: center;
      padding: 5px 8px;
      border-radius: 6px;
      background: rgba(22, 200, 168, 0.15);
      border: 1px solid rgba(22, 200, 168, 0.35);
      font-weight: 600;
      font-size: 0.82rem;
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-weight: 500;
      font-size: 0.86rem;
      cursor: pointer;
      color: rgba(230, 240, 255, 0.9);
      user-select: none;
    }

    .radio-option input[type="radio"],
    .radio-option input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      margin: 0;
      border: 1.5px solid rgba(255, 255, 255, 0.25);
      background: rgba(5, 13, 24, 0.6);
      outline: none;
      transition: all 150ms ease;
      cursor: pointer;
      display: inline-grid;
      place-content: center;
      flex-shrink: 0;
    }

    .radio-option input[type="radio"] {
      border-radius: 50%;
    }

    .radio-option input[type="checkbox"] {
      border-radius: 3px;
    }

    .radio-option input[type="radio"]::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      transform: scale(0);
      transition: transform 150ms ease;
    }

    .radio-option input[type="radio"]:checked {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(22, 200, 168, 0.18);
    }

    .radio-option input[type="radio"]:checked::before {
      transform: scale(1);
    }

    .radio-option input[type="checkbox"]::before {
      content: "";
      width: 8px;
      height: 8px;
      background-color: var(--accent);
      transform: scale(0);
      transition: transform 150ms ease;
      clip-path: polygon(14% 44%, 0 58%, 35% 93%, 100% 28%, 86% 14%, 35% 65%);
    }

    .radio-option input[type="checkbox"]:checked {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(22, 200, 168, 0.18);
    }

    .radio-option input[type="checkbox"]:checked::before {
      transform: scale(1);
    }

    .radio-option:hover input[type="radio"],
    .radio-option:hover input[type="checkbox"] {
      border-color: var(--accent-2);
    }

    .time-range {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 10px;
      align-items: center;
    }

    .time-separator {
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .validation-summary {
      margin: 0;
      font-size: 0.82rem;
      color: var(--muted);
    }

    .validation-summary.ok {
      color: #8ef2d8;
    }

    .validation-summary.error {
      color: #ffd6d6;
    }

    .validation-list {
      margin: 0;
      padding-left: 16px;
      color: #ffd6d6;
      font-size: 0.8rem;
      line-height: 1.35;
      max-height: 120px;
      overflow-y: auto;
    }

    .validation-list li + li {
      margin-top: 4px;
    }

    .validation-list code {
      color: #ffd6d6;
      background: transparent;
      font-size: 0.78rem;
    }

    .hidden {
      display: none;
    }

    .path-display {
      width: 100%;
      border: 1px solid var(--input-border);
      background: var(--input-bg);
      color: var(--text);
      border-radius: 6px;
      padding: 7px 10px;
      font: inherit;
      font-size: 0.85rem;
      min-height: 32px;
      display: flex;
      align-items: center;
      line-height: 1.3;
      word-break: break-all;
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .actions {
      border-top: 1px solid var(--line);
      padding: 12px 16px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      background: rgba(10, 20, 34, 0.4);
    }

    .credit-footer {
      border-top: 1px solid var(--line);
      padding: 12px 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      color: var(--muted);
      font-size: 0.78rem;
    }

    .credit-footer strong {
      color: #d8e7ff;
      font-weight: 500;
    }

    button:not(.switch):not(.tab-btn) {
      border: 1px solid transparent;
      border-radius: 6px;
      color: #03151f;
      background: linear-gradient(120deg, var(--accent), #44e2c5);
      padding: 6px 12px;
      font: inherit;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 150ms ease, border-color 150ms ease, transform 100ms ease, box-shadow 150ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    button:not(.switch):not(.tab-btn):hover {
      filter: brightness(1.06);
      box-shadow: 0 4px 12px rgba(22, 200, 168, 0.2);
    }

    button:not(.switch):not(.tab-btn):active {
      transform: scale(0.98);
    }

    button:not(.switch):not(.tab-btn):disabled {
      cursor: not-allowed;
      opacity: 0.45;
      transform: none;
      filter: none;
      box-shadow: none;
    }

    button:not(.switch):not(.tab-btn).secondary {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    button:not(.switch):not(.tab-btn).secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.25);
      box-shadow: 0 4px 12px rgba(255, 255, 255, 0.04);
    }

    button:not(.switch):not(.tab-btn).ghost {
      color: #ffd6d6;
      background: rgba(255, 111, 111, 0.06);
      border: 1px solid rgba(255, 111, 111, 0.2);
    }

    button:not(.switch):not(.tab-btn).ghost:hover {
      background: rgba(255, 111, 111, 0.12);
      border-color: rgba(255, 111, 111, 0.3);
      box-shadow: 0 4px 12px rgba(255, 111, 111, 0.05);
    }

    .tabs-nav {
      display: flex;
      border-bottom: 1px solid var(--line);
      background: rgba(10, 20, 34, 0.35);
      padding: 0 16px;
      gap: 4px;
      overflow-x: auto;
    }

    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--muted);
      padding: 12px 16px;
      font-family: inherit;
      font-size: 0.84rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }

    .status {
      margin-right: auto;
      font-size: 0.82rem;
      color: var(--muted);
      opacity: 0;
      transform: translateY(2px);
      transition: opacity 160ms ease, transform 160ms ease;
    }

    .status.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .status.error {
      color: var(--danger);
    }

    .status.warn {
      color: #ffd27a;
    }

    @media (max-width: 860px) {
      .grid {
        grid-template-columns: 1fr;
        padding: 12px;
        gap: 12px;
      }
      .hero {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        padding: 14px 16px;
      }
      .tabs-nav {
        padding: 0 8px;
      }
      .tab-btn {
        padding: 10px 12px;
        font-size: 0.82rem;
      }
      .wrap {
        width: 100%;
        border-radius: 0;
        border: none;
      }
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="brand">
        <img src="${iconUri}" alt="Faah" />
        <div>
          <h1>Faah Control Room</h1>
          <p>Tune your alert behavior without opening VS Code settings.</p>
        </div>
      </div>
      <div id="pillStatus" class="pill" role="status" aria-live="polite">Settings auto-save instantly to keep everything in sync.</div>
    </section>
    <nav class="tabs-nav" role="tablist" aria-label="Settings Categories">
      <button class="tab-btn active" data-tab="overview" role="tab" aria-selected="true" aria-controls="tab-overview" type="button">Overview</button>
      <button class="tab-btn" data-tab="detection" role="tab" aria-selected="false" aria-controls="tab-detection" type="button">Detection</button>
      <button class="tab-btn" data-tab="sound" role="tab" aria-selected="false" aria-controls="tab-sound" type="button">Sound & Quiet</button>
      <button class="tab-btn" data-tab="patterns" role="tab" aria-selected="false" aria-controls="tab-patterns" type="button">Patterns</button>
      <button class="tab-btn" data-tab="backup" role="tab" aria-selected="false" aria-controls="tab-backup" type="button">Backup & Tools</button>
    </nav>

    <section id="tab-overview" class="grid tab-content" role="tabpanel" aria-label="Overview">
      <article class="card full notice">
        <label>Host Compatibility</label>
        <div class="hint">${terminalStatusMessage}</div>
        <div class="button-row">
          <button class="secondary" id="compatibilityBtn" type="button">Show Compatibility Status</button>
        </div>
      </article>

      <article class="card full">
        <div class="row">
          <div>
            <label>Enable Faah</label>
            <div class="hint">Turn error sound monitoring on or off.</div>
          </div>
          <button id="enabledSwitch" class="switch" type="button" aria-label="Toggle enabled"><span></span></button>
        </div>
      </article>

      <article class="card">
        <label>Visual Alerts</label>
        <div class="row">
          <div>
            <div>Popup notifications</div>
            <div class="hint">Show a visual warning when Faah detects an issue.</div>
          </div>
          <button id="visualAlertsSwitch" class="switch" type="button" aria-label="Toggle visual alerts"><span></span></button>
        </div>
      </article>

      <article class="card">
        <label for="saveTarget">Save Scope</label>
        <select id="saveTarget" aria-label="Save scope">
          <option value="global"${selectedSaveTarget === "global" ? " selected" : ""}>User (Global)</option>
          <option value="workspace"${selectedSaveTarget === "workspace" ? " selected" : ""}${hasWorkspace ? "" : " disabled"}>Workspace</option>
        </select>
        <div class="hint">
          ${
            hasWorkspace
              ? "Choose where auto-saved settings should be stored."
              : "No workspace open. Settings will be saved to user settings."
          }
        </div>
      </article>

      <article class="card full">
        <label>Quick Presets</label>
        <div class="hint">Apply a ready-made profile without changing your custom sound or regex lists.</div>
        <div class="button-row">
          <button class="secondary" id="presetBalancedBtn" type="button">Balanced</button>
          <button class="secondary" id="presetQuietBtn" type="button">Quiet</button>
          <button class="secondary" id="presetAggressiveBtn" type="button">Aggressive</button>
        </div>
      </article>
    </section>

    <section id="tab-detection" class="grid tab-content hidden" role="tabpanel" aria-label="Detection">
      <article class="card full">
        <label>Detection Sources</label>
        <div class="row">
          <div>
            <div>Terminal Output</div>
            <div class="hint">${
              terminalMonitoringSupported
                ? terminalMonitoringCapability === "exitCodeOnly"
                  ? "This host only supports terminal exit-code alerts. Output-stream monitoring is unavailable here."
                  : terminalMonitoringCapability === "outputOnly"
                    ? "This host only supports terminal output-stream alerts. Non-zero exit-code monitoring is unavailable here."
                    : "Play alerts for terminal command output."
                : "Unavailable in this host. Your saved preference is preserved, but runtime monitoring is disabled here."
            }</div>
          </div>
          <button id="monitorTerminalSwitch" class="switch" type="button" aria-label="Toggle terminal monitoring" ${
            terminalMonitoringSupported ? "" : "disabled"
          }><span></span></button>
        </div>
        <div class="row" style="margin-top: 10px;">
          <div>
            <div>Editor Diagnostics</div>
            <div class="hint">Play alerts for problems in the active editor file.</div>
          </div>
          <button id="monitorDiagnosticsSwitch" class="switch" type="button" aria-label="Toggle diagnostics monitoring"><span></span></button>
        </div>
        <label for="diagnosticsSeverity" style="margin-top: 12px;">Diagnostics Severity</label>
        <select id="diagnosticsSeverity">
          <option value="error">Error only</option>
          <option value="warningAndError">Error + Warning</option>
        </select>
        <label for="terminalDetectionMode" style="margin-top: 12px;">Terminal Detection Mode</label>
        <select id="terminalDetectionMode">
          <option value="either">Output match or non-zero exit</option>
          <option value="output">Output match only</option>
          <option value="exitCode">Non-zero exit only</option>
        </select>
        <div class="hint">Use output-only to ignore expected non-zero exits, or exit-only to ignore noisy logs.</div>
      </article>

      <article class="card">
        <label for="terminalCooldownMs">Terminal Cooldown (ms)</label>
        <div class="volume-row">
          <input id="terminalCooldownMs" type="range" min="500" max="10000" step="100" />
          <div id="terminalCooldownLabel" class="value-badge">1500ms</div>
        </div>
        <div class="hint">Delay between terminal-triggered alerts (minimum 500ms).</div>
      </article>

      <article class="card">
        <label for="diagnosticsCooldownMs">Diagnostics Cooldown (ms)</label>
        <div class="volume-row">
          <input id="diagnosticsCooldownMs" type="range" min="500" max="10000" step="100" />
          <div id="diagnosticsCooldownLabel" class="value-badge">1500ms</div>
        </div>
        <div class="hint">Delay between diagnostics-triggered alerts (minimum 500ms).</div>
      </article>
    </section>

    <section id="tab-sound" class="grid tab-content hidden" role="tabpanel" aria-label="Sound & Quiet">
      <article class="card full">
        <label>Volume</label>
        <div class="volume-row">
          <input id="volumePercent" type="range" min="0" max="100" step="5" />
          <div id="volumeLabel" class="value-badge">70%</div>
        </div>
        <div class="hint">0% is mute and 100% is max.</div>
      </article>

      <article class="card full">
        <label>Quiet Hours</label>
        <div class="row">
          <div>
            <div>Suppress alerts during selected hours.</div>
            <div class="hint">Use 24-hour time format.</div>
          </div>
          <button id="quietHoursSwitch" class="switch" type="button" aria-label="Toggle quiet hours"><span></span></button>
        </div>
        <div class="time-range">
          <input id="quietHoursStart" type="time" step="60" aria-label="Quiet hours start" />
          <span class="time-separator">to</span>
          <input id="quietHoursEnd" type="time" step="60" aria-label="Quiet hours end" />
        </div>
      </article>

      <article class="card full">
        <label>Custom Sound (optional)</label>
        <div id="customSoundPathDisplay" class="path-display" role="status" aria-live="polite"></div>
        <div class="hint">Upload/select a sound file to override default playback.</div>
        <div class="hint">Use default to return to bundled <code>faah</code>.</div>
        <div class="button-row">
          <button class="secondary" id="uploadSoundBtn" type="button">Upload Sound File</button>
          <button class="secondary" id="useDefaultSoundBtn" type="button">Use Default (faah)</button>
        </div>
      </article>
    </section>

    <section id="tab-patterns" class="grid tab-content hidden" role="tabpanel" aria-label="Patterns">
      <article class="card full">
        <label>Pattern Mode</label>
        <div class="radio-group" role="radiogroup" aria-label="Pattern mode">
          <label class="radio-option" for="patternModeOverride">
            <input id="patternModeOverride" type="radio" name="patternMode" value="override" />
            <span>Override built-in patterns</span>
          </label>
          <label class="radio-option" for="patternModeAppend">
            <input id="patternModeAppend" type="radio" name="patternMode" value="append" />
            <span>Append to built-in patterns</span>
          </label>
        </div>
        <div class="hint">Override uses only your list. Append keeps built-ins and adds your list.</div>
      </article>

      <article class="card full">
        <div id="appendReadonlyWrap" class="mode-preview hidden">
          <label for="builtInPatternsList">Built-in Patterns</label>
          <ul id="builtInPatternsList" class="pattern-list" aria-label="Built-in patterns"></ul>
        </div>
        <label for="patterns">Custom Error Patterns (one regex per line)</label>
        <textarea id="patterns" spellcheck="false"></textarea>
        <div class="hint">Invalid regex lines are ignored safely during detection.</div>
      </article>

      <article class="card full">
        <label for="excludePatterns">Exclude Patterns (one regex per line)</label>
        <textarea id="excludePatterns" spellcheck="false"></textarea>
        <div class="hint">Lines or diagnostics matching these regexes are ignored to reduce false positives.</div>
      </article>

      <article class="card full">
        <label>False-Positive Presets</label>
        <div id="excludePresetOptions" class="radio-group" role="group" aria-label="Exclude pattern presets"></div>
        <div class="hint">Preset groups add built-in exclude regexes for common noisy output.</div>
      </article>

      <article class="card full">
        <label>Regex Validation Preview</label>
        <p id="regexValidationSummary" class="validation-summary">No patterns to validate yet.</p>
        <ul id="invalidPatternList" class="validation-list hidden" aria-label="Invalid custom patterns"></ul>
        <ul id="invalidExcludePatternList" class="validation-list hidden" aria-label="Invalid exclude patterns"></ul>
      </article>
    </section>

    <section id="tab-backup" class="grid tab-content hidden" role="tabpanel" aria-label="Backup & Tools">
      <article class="card full">
        <label>Settings Backup</label>
        <div class="hint">Export your current Faah setup to JSON or import it on another machine.</div>
        <div class="button-row">
          <button class="secondary" id="exportSettingsBtn" type="button">Export Settings</button>
          <button class="secondary" id="importSettingsBtn" type="button">Import Settings</button>
        </div>
      </article>
    </section>

    <section class="actions">
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <button class="ghost" id="resetBtn" type="button">Reset Defaults</button>
      <button class="secondary" id="testBtn" type="button">Play Test Sound</button>
    </section>

    <section class="credit-footer" aria-label="Credits">
      <div><strong>Developed by:</strong> Toufiq Hasan Kiron</div>
      <div><strong>Concept:</strong> Md Shoaib Taimur</div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const defaults = ${JSON.stringify(defaultStoredSettings).replace(/</g, "\\u003c")};
    const excludePresetDefinitions = ${JSON.stringify(excludePatternPresetDefinitions).replace(/</g, "\\u003c")};
    const initial = ${bootSettings};
    let hasWorkspace = ${JSON.stringify(hasWorkspace)};
    const terminalMonitoringSupported = ${JSON.stringify(terminalMonitoringSupported)};

    const ui = {
      compatibilityBtn: document.getElementById("compatibilityBtn"),
      enabledSwitch: document.getElementById("enabledSwitch"),
      monitorTerminalSwitch: document.getElementById("monitorTerminalSwitch"),
      monitorDiagnosticsSwitch: document.getElementById("monitorDiagnosticsSwitch"),
      diagnosticsSeverity: document.getElementById("diagnosticsSeverity"),
      terminalDetectionMode: document.getElementById("terminalDetectionMode"),
      terminalCooldownMs: document.getElementById("terminalCooldownMs"),
      terminalCooldownLabel: document.getElementById("terminalCooldownLabel"),
      diagnosticsCooldownMs: document.getElementById("diagnosticsCooldownMs"),
      diagnosticsCooldownLabel: document.getElementById("diagnosticsCooldownLabel"),
      volumePercent: document.getElementById("volumePercent"),
      volumeLabel: document.getElementById("volumeLabel"),
      visualAlertsSwitch: document.getElementById("visualAlertsSwitch"),
      customSoundPathDisplay: document.getElementById("customSoundPathDisplay"),
      uploadSoundBtn: document.getElementById("uploadSoundBtn"),
      useDefaultSoundBtn: document.getElementById("useDefaultSoundBtn"),
      quietHoursSwitch: document.getElementById("quietHoursSwitch"),
      quietHoursStart: document.getElementById("quietHoursStart"),
      quietHoursEnd: document.getElementById("quietHoursEnd"),
      presetBalancedBtn: document.getElementById("presetBalancedBtn"),
      presetQuietBtn: document.getElementById("presetQuietBtn"),
      presetAggressiveBtn: document.getElementById("presetAggressiveBtn"),
      patternModeOverride: document.getElementById("patternModeOverride"),
      patternModeAppend: document.getElementById("patternModeAppend"),
      patterns: document.getElementById("patterns"),
      excludePatterns: document.getElementById("excludePatterns"),
      excludePresetOptions: document.getElementById("excludePresetOptions"),
      regexValidationSummary: document.getElementById("regexValidationSummary"),
      invalidPatternList: document.getElementById("invalidPatternList"),
      invalidExcludePatternList: document.getElementById("invalidExcludePatternList"),
      appendReadonlyWrap: document.getElementById("appendReadonlyWrap"),
      builtInPatternsList: document.getElementById("builtInPatternsList"),
      saveTarget: document.getElementById("saveTarget"),
      exportSettingsBtn: document.getElementById("exportSettingsBtn"),
      importSettingsBtn: document.getElementById("importSettingsBtn"),
      testBtn: document.getElementById("testBtn"),
      resetBtn: document.getElementById("resetBtn"),
      status: document.getElementById("status"),
      pillStatus: document.getElementById("pillStatus"),
    };

    const autoSaveDebounceMs = 450;
    const textAutoSaveDebounceMs = 900;
    const defaultPillMessage = "Settings auto-save instantly to keep everything in sync.";
    let enabled = true;
    let monitorTerminal = true;
    let monitorDiagnostics = true;
    let showVisualNotifications = false;
    let customSoundPath = "";
    let quietHoursEnabled = false;
    let invalidRegexCount = 0;
    let statusTimer = null;
    let pillTimer = null;
    let autoSaveTimer = null;
    let saveInFlight = false;
    let queuedSave = false;
    let latestSavedSignature = "";

    function setSwitchState(element, isOn) {
      element.classList.toggle("on", isOn);
    }

    function syncTerminalCooldownLabel() {
      ui.terminalCooldownLabel.textContent = ui.terminalCooldownMs.value + "ms";
    }

    function syncDiagnosticsCooldownLabel() {
      ui.diagnosticsCooldownLabel.textContent = ui.diagnosticsCooldownMs.value + "ms";
    }

    function syncCustomSoundDisplay() {
      if (!customSoundPath) {
        ui.customSoundPathDisplay.textContent = "Using default: faah";
        return;
      }

      ui.customSoundPathDisplay.textContent = customSoundPath;
    }

    function applySettings(settings) {
      enabled = !!settings.enabled;
      monitorTerminal = !!settings.monitorTerminal;
      monitorDiagnostics = !!settings.monitorDiagnostics;
      showVisualNotifications = !!settings.showVisualNotifications;
      quietHoursEnabled = !!settings.quietHoursEnabled;
      setSwitchState(ui.enabledSwitch, enabled);
      setSwitchState(ui.monitorTerminalSwitch, monitorTerminal);
      setSwitchState(ui.monitorDiagnosticsSwitch, monitorDiagnostics);
      setSwitchState(ui.visualAlertsSwitch, showVisualNotifications);
      setSwitchState(ui.quietHoursSwitch, quietHoursEnabled);
      ui.diagnosticsSeverity.value =
        settings.diagnosticsSeverity === "warningAndError" ? "warningAndError" : "error";
      ui.terminalDetectionMode.value =
        settings.terminalDetectionMode === "output" || settings.terminalDetectionMode === "exitCode"
          ? settings.terminalDetectionMode
          : "either";
      ui.terminalCooldownMs.value = String(
        Math.max(500, settings.terminalCooldownMs ?? settings.cooldownMs ?? 1500),
      );
      ui.diagnosticsCooldownMs.value = String(
        Math.max(500, settings.diagnosticsCooldownMs ?? settings.cooldownMs ?? 1500),
      );
      ui.volumePercent.value = String(settings.volumePercent ?? 70);
      customSoundPath = typeof settings.customSoundPath === "string" ? settings.customSoundPath : "";
      syncCustomSoundDisplay();
      ui.quietHoursStart.value =
        typeof settings.quietHoursStart === "string" ? settings.quietHoursStart : "22:00";
      ui.quietHoursEnd.value =
        typeof settings.quietHoursEnd === "string" ? settings.quietHoursEnd : "07:00";
      const patternMode = settings.patternMode === "append" ? "append" : "override";
      setPatternMode(patternMode);
      ui.patterns.value =
        Array.isArray(settings.patterns)
          ? settings.patterns.join("\\n")
          : "";
      ui.excludePatterns.value = Array.isArray(settings.excludePatterns)
        ? settings.excludePatterns.join("\\n")
        : "";
      syncExcludePresetOptions(Array.isArray(settings.excludePresetIds) ? settings.excludePresetIds : []);
      syncTerminalCooldownLabel();
      syncDiagnosticsCooldownLabel();
      syncVolumeLabel();
      syncRegexValidation();
    }

    function syncVolumeLabel() {
      ui.volumeLabel.textContent = ui.volumePercent.value + "%";
    }

    function getPatternMode() {
      return ui.patternModeAppend.checked ? "append" : "override";
    }

    function renderBuiltInPatternsList() {
      const patterns = Array.isArray(defaults.patterns) ? defaults.patterns : [];
      const items = patterns.map((pattern) => {
        const li = document.createElement("li");
        const code = document.createElement("code");
        code.textContent = String(pattern);
        li.appendChild(code);
        return li;
      });

      ui.builtInPatternsList.replaceChildren(...items);
    }

    function setPatternMode(mode) {
      const isAppend = mode === "append";
      ui.patternModeAppend.checked = isAppend;
      ui.patternModeOverride.checked = !isAppend;
      ui.appendReadonlyWrap.classList.toggle("hidden", !isAppend);
      renderBuiltInPatternsList();
    }

    function parseInvalidRegexLines(text) {
      return text
        .split(/\\r?\\n/)
        .map((rawLine, index) => ({
          lineNumber: index + 1,
          value: rawLine.trim(),
        }))
        .filter((entry) => entry.value.length > 0)
        .map((entry) => {
          try {
            new RegExp(entry.value, "i");
            return null;
          } catch (err) {
            return {
              lineNumber: entry.lineNumber,
              value: entry.value,
              reason: err instanceof Error ? err.message : String(err),
            };
          }
        })
        .filter((entry) => entry !== null);
    }

    function renderExcludePresetOptions() {
      const options = Array.isArray(excludePresetDefinitions)
        ? excludePresetDefinitions.map((preset) => {
            const label = document.createElement("label");
            label.className = "radio-option";
            label.htmlFor = "excludePreset-" + preset.id;

            const input = document.createElement("input");
            input.type = "checkbox";
            input.id = "excludePreset-" + preset.id;
            input.value = preset.id;
            input.dataset.presetId = preset.id;

            const textWrap = document.createElement("span");
            textWrap.textContent = preset.label + " - " + preset.description;

            label.appendChild(input);
            label.appendChild(textWrap);
            return label;
          })
        : [];

      ui.excludePresetOptions.replaceChildren(...options);
    }

    function syncExcludePresetOptions(selectedPresetIds) {
      const selected = new Set(
        Array.isArray(selectedPresetIds)
          ? selectedPresetIds.filter((item) => typeof item === "string")
          : [],
      );
      for (const input of ui.excludePresetOptions.querySelectorAll("input[type='checkbox']")) {
        input.checked = selected.has(input.dataset.presetId || "");
      }
    }

    function collectExcludePresetIds() {
      return Array.from(
        ui.excludePresetOptions.querySelectorAll("input[type='checkbox']:checked"),
      )
        .map((input) => input.dataset.presetId || "")
        .filter((value) => value.length > 0);
    }

    function renderValidationList(element, title, entries) {
      if (!entries.length) {
        element.classList.add("hidden");
        element.replaceChildren();
        return;
      }

      const maxVisible = 10;
      const visibleEntries = entries.slice(0, maxVisible);
      const items = visibleEntries.map((entry) => {
        const li = document.createElement("li");
        li.textContent = title + " line " + entry.lineNumber + ": ";
        const code = document.createElement("code");
        code.textContent = entry.value;
        li.appendChild(code);
        return li;
      });

      if (entries.length > maxVisible) {
        const more = document.createElement("li");
        more.textContent = "+" + String(entries.length - maxVisible) + " more invalid entries";
        items.push(more);
      }

      element.replaceChildren(...items);
      element.classList.remove("hidden");
    }

    function syncRegexValidation() {
      const invalidPatterns = parseInvalidRegexLines(ui.patterns.value);
      const invalidExcludePatterns = parseInvalidRegexLines(ui.excludePatterns.value);
      const totalInvalid = invalidPatterns.length + invalidExcludePatterns.length;
      invalidRegexCount = totalInvalid;

      if (totalInvalid === 0) {
        ui.regexValidationSummary.textContent = "All regex entries look valid.";
        ui.regexValidationSummary.classList.add("ok");
        ui.regexValidationSummary.classList.remove("error");
      } else {
        ui.regexValidationSummary.textContent =
          String(totalInvalid) + " invalid regex line(s) detected.";
        ui.regexValidationSummary.classList.add("error");
        ui.regexValidationSummary.classList.remove("ok");
      }

      renderValidationList(ui.invalidPatternList, "Pattern", invalidPatterns);
      renderValidationList(ui.invalidExcludePatternList, "Exclude", invalidExcludePatterns);
    }

    function collectSettings() {
      const terminalCooldownRaw = Number(ui.terminalCooldownMs.value);
      const diagnosticsCooldownRaw = Number(ui.diagnosticsCooldownMs.value);
      const volumeRaw = Number(ui.volumePercent.value);
      const terminalCooldownMs = Number.isFinite(terminalCooldownRaw)
        ? Math.max(500, Math.round(terminalCooldownRaw))
        : 1500;
      const diagnosticsCooldownMs = Number.isFinite(diagnosticsCooldownRaw)
        ? Math.max(500, Math.round(diagnosticsCooldownRaw))
        : 1500;
      return {
        enabled,
        monitorTerminal,
        monitorDiagnostics,
        showVisualNotifications,
        quietHoursEnabled,
        diagnosticsSeverity:
          ui.diagnosticsSeverity.value === "warningAndError" ? "warningAndError" : "error",
        terminalDetectionMode:
          ui.terminalDetectionMode.value === "output" || ui.terminalDetectionMode.value === "exitCode"
            ? ui.terminalDetectionMode.value
            : "either",
        cooldownMs: Math.max(terminalCooldownMs, diagnosticsCooldownMs),
        terminalCooldownMs,
        diagnosticsCooldownMs,
        volumePercent: Number.isFinite(volumeRaw) ? Math.min(100, Math.max(0, Math.round(volumeRaw))) : 70,
        customSoundPath: customSoundPath.trim(),
        quietHoursStart: ui.quietHoursStart.value || "22:00",
        quietHoursEnd: ui.quietHoursEnd.value || "07:00",
        excludePresetIds: collectExcludePresetIds(),
        patternMode: getPatternMode(),
        patterns: ui.patterns.value
          .split(/\\r?\\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
        excludePatterns: ui.excludePatterns.value
          .split(/\\r?\\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      };
    }

    function syncSaveTarget(target) {
      if (!ui.saveTarget) return;
      ui.saveTarget.value =
        target === "workspace" && hasWorkspace ? "workspace" : "global";
    }

    function syncWorkspaceAvailability(nextHasWorkspace) {
      hasWorkspace = !!nextHasWorkspace;
      if (!ui.saveTarget) return;

      const workspaceOption = ui.saveTarget.querySelector(
        'option[value="workspace"]',
      );
      if (workspaceOption) {
        workspaceOption.disabled = !hasWorkspace;
      }

      if (!hasWorkspace && ui.saveTarget.value === "workspace") {
        ui.saveTarget.value = "global";
      }
    }

    function getPersistTarget() {
      if (!hasWorkspace) return "global";
      if (ui.saveTarget && ui.saveTarget.value === "workspace") return "workspace";
      return "global";
    }

    function createSettingsSignature(settings) {
      return JSON.stringify(settings);
    }

    function flashPill(text, kind = "ok") {
      ui.pillStatus.textContent = text;
      ui.pillStatus.classList.toggle("error", kind === "error");
      ui.pillStatus.classList.toggle("warn", kind === "warn");
      if (pillTimer) clearTimeout(pillTimer);
      pillTimer = setTimeout(() => {
        ui.pillStatus.textContent = defaultPillMessage;
        ui.pillStatus.classList.remove("error");
        ui.pillStatus.classList.remove("warn");
      }, 2200);
    }

    function flashStatus(text, kind = "ok") {
      ui.status.textContent = text;
      ui.status.classList.toggle("error", kind === "error");
      ui.status.classList.toggle("warn", kind === "warn");
      ui.status.classList.add("visible");
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        ui.status.classList.remove("visible");
        ui.status.classList.remove("error");
        ui.status.classList.remove("warn");
      }, 2200);
      flashPill(text, kind);
    }

    function formatSkippedConfigurationWarning(skippedConfigurationKeys) {
      if (!Array.isArray(skippedConfigurationKeys)) return "";
      const keys = skippedConfigurationKeys.filter(
        (key) => typeof key === "string" && key.trim().length > 0,
      );
      if (keys.length === 0) return "";
      if (keys.length === 1) {
        return "VS Code rejected " + keys[0] + ", so Faah kept the value in its own settings store.";
      }
      const preview = keys.slice(0, 3).join(", ");
      const suffix = keys.length > 3 ? " and " + String(keys.length - 3) + " more" : "";
      return (
        "VS Code rejected " +
        String(keys.length) +
        " setting(s) (" +
        preview +
        suffix +
        "), so Faah kept them in its own settings store."
      );
    }

    function flushQueuedSave() {
      if (!queuedSave) return;
      queuedSave = false;
      requestSave(true);
    }

    function requestSave(force = false, explicitPayload) {
      const payload = explicitPayload || collectSettings();
      const signature = createSettingsSignature(payload);

      if (!force && invalidRegexCount > 0) {
        flashPill("Fix invalid regex entries to resume auto-save.", "error");
        return false;
      }
      if (!force && signature === latestSavedSignature) return false;

      if (saveInFlight) {
        queuedSave = true;
        return false;
      }

      saveInFlight = true;
      vscode.postMessage({ type: "save", payload, target: getPersistTarget() });
      return true;
    }

    function scheduleAutoSave(delay = autoSaveDebounceMs) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        requestSave();
      }, delay);
    }

    function markChanged(delay = autoSaveDebounceMs) {
      flashPill("Changes detected. Auto-saving...");
      scheduleAutoSave(delay);
    }

    function requestPreset(presetId) {
      vscode.postMessage({
        type: "applyPreset",
        presetId,
        target: getPersistTarget(),
      });
    }

    ui.enabledSwitch.addEventListener("click", () => {
      enabled = !enabled;
      setSwitchState(ui.enabledSwitch, enabled);
      markChanged();
    });
    ui.compatibilityBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "showCompatibilityStatus" });
    });
    ui.monitorTerminalSwitch.addEventListener("click", () => {
      if (!terminalMonitoringSupported) {
        flashStatus("Terminal monitoring is unavailable in this host.", "error");
        return;
      }
      monitorTerminal = !monitorTerminal;
      setSwitchState(ui.monitorTerminalSwitch, monitorTerminal);
      markChanged();
    });
    ui.monitorDiagnosticsSwitch.addEventListener("click", () => {
      monitorDiagnostics = !monitorDiagnostics;
      setSwitchState(ui.monitorDiagnosticsSwitch, monitorDiagnostics);
      markChanged();
    });
    ui.visualAlertsSwitch.addEventListener("click", () => {
      showVisualNotifications = !showVisualNotifications;
      setSwitchState(ui.visualAlertsSwitch, showVisualNotifications);
      markChanged();
    });
    ui.quietHoursSwitch.addEventListener("click", () => {
      quietHoursEnabled = !quietHoursEnabled;
      setSwitchState(ui.quietHoursSwitch, quietHoursEnabled);
      markChanged();
    });
    ui.uploadSoundBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "selectSoundFile" });
    });
    ui.useDefaultSoundBtn.addEventListener("click", () => {
      customSoundPath = "";
      syncCustomSoundDisplay();
      markChanged();
    });

    ui.volumePercent.addEventListener("input", () => {
      syncVolumeLabel();
      markChanged();
    });
    ui.terminalCooldownMs.addEventListener("input", () => {
      syncTerminalCooldownLabel();
      markChanged();
    });
    ui.diagnosticsCooldownMs.addEventListener("input", () => {
      syncDiagnosticsCooldownLabel();
      markChanged();
    });
    ui.diagnosticsSeverity.addEventListener("change", () => {
      markChanged();
    });
    ui.terminalDetectionMode.addEventListener("change", () => {
      markChanged();
    });
    ui.saveTarget.addEventListener("change", () => {
      flashPill("Save scope changed. Auto-saving current settings...");
      requestSave(true);
    });
    ui.quietHoursStart.addEventListener("input", () => {
      markChanged();
    });
    ui.quietHoursEnd.addEventListener("input", () => {
      markChanged();
    });
    ui.patterns.addEventListener("input", () => {
      syncRegexValidation();
      markChanged(textAutoSaveDebounceMs);
    });
    ui.excludePatterns.addEventListener("input", () => {
      syncRegexValidation();
      markChanged(textAutoSaveDebounceMs);
    });
    ui.excludePresetOptions.addEventListener("change", () => {
      markChanged(textAutoSaveDebounceMs);
    });
    ui.patternModeOverride.addEventListener("change", () => {
      if (!ui.patternModeOverride.checked) return;
      setPatternMode("override");
      syncRegexValidation();
      markChanged(textAutoSaveDebounceMs);
    });
    ui.patternModeAppend.addEventListener("change", () => {
      if (!ui.patternModeAppend.checked) return;
      setPatternMode("append");
      syncRegexValidation();
      markChanged(textAutoSaveDebounceMs);
    });
    ui.presetBalancedBtn.addEventListener("click", () => {
      requestPreset("balanced");
    });
    ui.presetQuietBtn.addEventListener("click", () => {
      requestPreset("quiet");
    });
    ui.presetAggressiveBtn.addEventListener("click", () => {
      requestPreset("aggressive");
    });
    ui.exportSettingsBtn.addEventListener("click", () => {
      vscode.postMessage({
        type: "exportSettings",
        payload: collectSettings(),
      });
    });
    ui.importSettingsBtn.addEventListener("click", () => {
      vscode.postMessage({
        type: "importSettings",
        target: getPersistTarget(),
      });
    });

    ui.testBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "test", payload: collectSettings() });
    });

    ui.resetBtn.addEventListener("click", () => {
      const resetSettings = {
        ...defaults,
        patterns: Array.isArray(defaults.patterns) ? [...defaults.patterns] : [],
        excludePatterns: Array.isArray(defaults.excludePatterns) ? [...defaults.excludePatterns] : [],
      };
      applySettings(resetSettings);
      requestSave(true, resetSettings);
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;

      if (message.type === "saved") {
        saveInFlight = false;
        const savedSettings = message.payload || initial;
        latestSavedSignature = createSettingsSignature(savedSettings);
        applySettings(savedSettings);
        syncSaveTarget(message.target);
        const targetLabel = message.target === "workspace" ? "workspace" : "user";
        const warningText = formatSkippedConfigurationWarning(
          message.skippedConfigurationKeys,
        );
        if (warningText) {
          flashStatus(
            "Changes auto-saved to " + targetLabel + " settings. " + warningText,
            "warn",
          );
        } else {
          flashStatus("Changes auto-saved to " + targetLabel + " settings");
        }
        flushQueuedSave();
        return;
      }

      if (message.type === "workspaceFoldersUpdated") {
        syncWorkspaceAvailability(message.hasWorkspace);
        syncSaveTarget(ui.saveTarget ? ui.saveTarget.value : "global");
        return;
      }

      if (message.type === "selectedSoundFile") {
        if (typeof message.payload === "string" && message.payload.trim().length > 0) {
          customSoundPath = message.payload.trim();
          syncCustomSoundDisplay();
          flashStatus("Sound file selected. Auto-saving...");
          markChanged();
        }
        return;
      }

      if (message.type === "externalSettingsUpdated") {
        const externalSettings = message.payload || initial;
        latestSavedSignature = createSettingsSignature(externalSettings);
        applySettings(externalSettings);
        return;
      }

      if (message.type === "exported") {
        flashStatus("Settings exported successfully");
        return;
      }

      if (message.type === "error") {
        saveInFlight = false;
        queuedSave = false;
        flashStatus(String(message.payload || "Failed to save settings"), "error");
      }
    });

    renderExcludePresetOptions();
    applySettings(initial);
    latestSavedSignature = createSettingsSignature(collectSettings());

    // Tab switching logic
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;
        
        tabButtons.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        tabContents.forEach((tc) => tc.classList.add("hidden"));

        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const targetEl = document.getElementById("tab-" + targetTab);
        if (targetEl) {
          targetEl.classList.remove("hidden");
        }
      });
    });
  </script>
</body>
</html>`;
}

export function registerSettingsUiCommand(
  context: vscode.ExtensionContext,
  getStoredSettings: () => StoredSettings,
  onSaved: (
    settings: StoredSettings,
    target: SettingsPersistTarget,
  ) => Promise<void | PersistStoredSettingsResult>,
  onTest: (settings: StoredSettings) => void,
  terminalMonitoringCapability: TerminalMonitoringCapability,
  commandId = commandIds.openSettingsUi,
): vscode.Disposable {
  let panel: vscode.WebviewPanel | undefined;

  function getInitialSaveTarget(): SettingsPersistTarget {
    return normalizeSaveTarget(
      typeof context.globalState?.get === "function"
        ? context.globalState.get<SettingsPersistTarget>(saveTargetStorageKey)
        : undefined,
      (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
    );
  }

  function hasWorkspaceOpen(): boolean {
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  }

  function getPersistTargetFromMessage(
    messageTarget: unknown,
  ): SettingsPersistTarget {
    return messageTarget === "workspace" && hasWorkspaceOpen()
      ? "workspace"
      : "global";
  }

  function renderPanelHtml(): string {
    return renderSettingsWebview(
      panel!.webview,
      context,
      getStoredSettings(),
      hasWorkspaceOpen(),
      terminalMonitoringCapability,
      getInitialSaveTarget(),
    );
  }

  const commandDisposable = vscode.commands.registerCommand(
    commandId,
    async () => {
      if (panel) {
        panel.reveal(vscode.ViewColumn.One);
        panel.webview.html = renderPanelHtml();
        return;
      }

      panel = vscode.window.createWebviewPanel(
        "faahSettings",
        "Faah Settings",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );
      const panelIconPath = vscode.Uri.joinPath(
        context.extensionUri,
        "images",
        "icon.png",
      );
      panel.iconPath = {
        light: panelIconPath,
        dark: panelIconPath,
      };

      panel.webview.html = renderPanelHtml();

      panel.onDidDispose(() => {
        panel = undefined;
      });

      panel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message.type !== "string") return;

        if (message.type === "selectSoundFile") {
          const selected = await vscode.window.showOpenDialog({
            title: "Select custom Faah sound",
            canSelectMany: false,
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
              Audio: ["wav", "mp3", "ogg", "m4a", "aac", "flac"],
              AllFiles: ["*"],
            },
          });
          const selectedPath = selected?.[0]?.fsPath;
          if (selectedPath) {
            panel?.webview.postMessage({
              type: "selectedSoundFile",
              payload: selectedPath,
            });
          }
          return;
        }

        if (message.type === "test") {
          const normalized = normalizeStoredSettings(
            (message.payload ?? {}) as Partial<StoredSettings>,
          );
          onTest(normalized);
          return;
        }

        if (message.type === "showCompatibilityStatus") {
          await vscode.commands.executeCommand(
            commandIds.showCompatibilityStatus,
          );
          return;
        }

        if (message.type === "applyPreset") {
          try {
            const presetId = String(message.presetId ?? "");
            if (!validPresetIds.has(presetId as SettingsPresetId)) {
              throw new Error(`Unknown settings preset: ${presetId}`);
            }
            const persistTarget = getPersistTargetFromMessage(message.target);
            const presetSettings = createPresetSettings(
              getStoredSettings(),
              presetId as SettingsPresetId,
              terminalMonitoringCapability !== "none",
            );
            const savedResult = await onSaved(presetSettings, persistTarget);
            await rememberSaveTarget(context, persistTarget);
            panel?.webview.postMessage({
              type: "saved",
              payload: presetSettings,
              target: persistTarget,
              skippedConfigurationKeys:
                savedResult && typeof savedResult === "object"
                  ? savedResult.skippedConfigurationKeys
                  : [],
            });
          } catch (err) {
            const messageText =
              err instanceof Error ? err.message : String(err);
            panel?.webview.postMessage({ type: "error", payload: messageText });
          }
          return;
        }

        if (message.type === "exportSettings") {
          try {
            const normalized = normalizeStoredSettings(
              (message.payload ?? {}) as Partial<StoredSettings>,
            );
            const targetUri = await vscode.window.showSaveDialog({
              title: "Export Faah settings",
              saveLabel: "Export Settings",
              filters: {
                JSON: ["json"],
              },
            });
            if (!targetUri) return;

            await fs.writeFile(
              targetUri.fsPath,
              `${JSON.stringify(normalized, null, 2)}\n`,
              "utf8",
            );
            panel?.webview.postMessage({
              type: "exported",
              payload: targetUri.fsPath,
            });
          } catch (err) {
            const messageText =
              err instanceof Error ? err.message : String(err);
            panel?.webview.postMessage({ type: "error", payload: messageText });
          }
          return;
        }

        if (message.type === "importSettings") {
          try {
            const selected = await vscode.window.showOpenDialog({
              title: "Import Faah settings",
              canSelectMany: false,
              canSelectFiles: true,
              canSelectFolders: false,
              filters: {
                JSON: ["json"],
              },
            });
            const selectedPath = selected?.[0]?.fsPath;
            if (!selectedPath) return;

            const fileContents = await fs.readFile(selectedPath, "utf8");
            const parsed = JSON.parse(fileContents) as Partial<StoredSettings>;
            const normalized = normalizeStoredSettings(parsed);
            const persistTarget = getPersistTargetFromMessage(message.target);
            const savedResult = await onSaved(normalized, persistTarget);
            await rememberSaveTarget(context, persistTarget);
            panel?.webview.postMessage({
              type: "saved",
              payload: normalized,
              target: persistTarget,
              skippedConfigurationKeys:
                savedResult && typeof savedResult === "object"
                  ? savedResult.skippedConfigurationKeys
                  : [],
            });
          } catch (err) {
            const messageText =
              err instanceof Error ? err.message : String(err);
            panel?.webview.postMessage({ type: "error", payload: messageText });
          }
          return;
        }

        if (message.type !== "save") return;

        try {
          const normalized = normalizeStoredSettings(
            (message.payload ?? {}) as Partial<StoredSettings>,
          );
          const persistTarget = getPersistTargetFromMessage(message.target);
          const savedResult = await onSaved(normalized, persistTarget);
          await rememberSaveTarget(context, persistTarget);
          panel?.webview.postMessage({
            type: "saved",
            payload: normalized,
            target: persistTarget,
            skippedConfigurationKeys:
              savedResult && typeof savedResult === "object"
                ? savedResult.skippedConfigurationKeys
                : [],
          });
        } catch (err) {
          const messageText = err instanceof Error ? err.message : String(err);
          panel?.webview.postMessage({ type: "error", payload: messageText });
        }
      });
    },
  );

  const configurationDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (!panel) return;
      if (!event.affectsConfiguration("faah")) return;
      panel.webview.postMessage({
        type: "externalSettingsUpdated",
        payload: getStoredSettings(),
      });
    },
  );

  const workspaceFoldersDisposable =
    vscode.workspace.onDidChangeWorkspaceFolders?.(() => {
      if (!panel) return;
      panel.webview.postMessage({
        type: "workspaceFoldersUpdated",
        hasWorkspace: hasWorkspaceOpen(),
      });
    });

  return vscode.Disposable.from(
    commandDisposable,
    configurationDisposable,
    ...(workspaceFoldersDisposable ? [workspaceFoldersDisposable] : []),
  );
}
