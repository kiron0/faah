import * as vscode from "vscode";

import { commandIds } from "./commands";
import {
  defaultStoredSettings,
  normalizeStoredSettings,
  type SettingsPersistTarget,
  type StoredSettings,
} from "./settings";

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function renderSettingsWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  settings: StoredSettings,
  hasWorkspace: boolean,
): string {
  const nonce = getNonce();
  const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "images", "icon.png"));
  const bootSettings = JSON.stringify(settings).replace(/</g, "\\u003c");

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
      --panel: rgba(10, 20, 34, 0.88);
      --card: rgba(15, 31, 47, 0.9);
      --line: rgba(255, 255, 255, 0.12);
      --text: #e6f0ff;
      --muted: #9fb3c8;
      --accent: #16c8a8;
      --accent-2: #5bb6ff;
      --danger: #ff6f6f;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(70rem 35rem at -10% -20%, rgba(91, 182, 255, 0.25), transparent 60%),
        radial-gradient(70rem 35rem at 110% 120%, rgba(22, 200, 168, 0.22), transparent 60%),
        linear-gradient(130deg, var(--bg-1), var(--bg-2));
      font-family: "Avenir Next", "Nunito Sans", "Segoe UI", sans-serif;
      min-height: 100vh;
      padding: 24px 12px 20px;
    }

    .wrap {
      width: min(1200px, calc(100vw - 24px));
      max-width: none;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      backdrop-filter: blur(10px);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }

    .hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 20px 24px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(100deg, rgba(91, 182, 255, 0.14), rgba(22, 200, 168, 0.1));
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand img {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.18);
    }

    h1 {
      margin: 0;
      font-size: 1.25rem;
      letter-spacing: 0.2px;
      font-weight: 700;
    }

    .hero p {
      margin: 3px 0 0;
      color: var(--muted);
      font-size: 0.92rem;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(91, 182, 255, 0.35);
      color: #d9edff;
      font-size: 0.8rem;
      background: rgba(91, 182, 255, 0.15);
      white-space: normal;
      max-width: min(60ch, 100%);
      line-height: 1.3;
    }

    .pill.error {
      border-color: rgba(255, 111, 111, 0.5);
      color: #ffd8d8;
      background: rgba(255, 111, 111, 0.16);
    }

    .grid {
      padding: 22px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--card);
      padding: 14px;
    }

    .card.full {
      grid-column: 1 / -1;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 650;
      font-size: 0.92rem;
    }

    .hint {
      margin-top: 6px;
      color: var(--muted);
      font-size: 0.82rem;
      line-height: 1.3;
    }

    input[type="text"], input[type="number"], select, textarea {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(5, 13, 24, 0.82);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 11px;
      outline: none;
      font: inherit;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }

    textarea {
      min-height: 140px;
      max-height: 240px;
      resize: vertical;
      overflow-y: auto;
      line-height: 1.35;
    }

    .pattern-list {
      margin: 0;
      padding: 10px 14px 10px 28px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(4, 10, 20, 0.8);
      color: rgba(230, 240, 255, 0.88);
      border-radius: 10px;
      max-height: 240px;
      overflow-y: auto;
      line-height: 1.35;
    }

    .pattern-list li + li {
      margin-top: 6px;
    }

    .pattern-list code {
      color: inherit;
      background: transparent;
      font-size: 0.82rem;
      font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
      word-break: break-word;
    }

    input:focus, select:focus, textarea:focus {
      border-color: var(--accent-2);
      box-shadow: 0 0 0 3px rgba(91, 182, 255, 0.22);
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .switch {
      position: relative;
      width: 56px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.15);
      cursor: pointer;
      transition: background 180ms ease, border-color 180ms ease;
    }

    .switch span {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #fff;
      transition: transform 180ms ease;
    }

    .switch.on {
      background: rgba(22, 200, 168, 0.32);
      border-color: rgba(22, 200, 168, 0.65);
    }

    .switch.on span {
      transform: translateX(26px);
    }

    .volume-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    input[type="range"] {
      width: 100%;
      accent-color: var(--accent);
    }

    .value-badge {
      min-width: 62px;
      text-align: center;
      padding: 7px 8px;
      border-radius: 9px;
      background: rgba(22, 200, 168, 0.2);
      border: 1px solid rgba(22, 200, 168, 0.4);
      font-weight: 700;
      font-size: 0.85rem;
    }

    .radio-group {
      display: grid;
      gap: 8px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 0;
      font-weight: 500;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .radio-option input[type="radio"] {
      margin: 0;
      accent-color: var(--accent);
    }

    .mode-preview {
      margin-top: 12px;
    }

    .time-range {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      margin-top: 10px;
    }

    .time-separator {
      color: var(--muted);
      font-size: 0.85rem;
      font-weight: 600;
    }

    .validation-summary {
      margin: 0;
      font-size: 0.85rem;
      color: var(--muted);
    }

    .validation-summary.ok {
      color: #8ef2d8;
    }

    .validation-summary.error {
      color: #ffd6d6;
    }

    .validation-list {
      margin: 10px 0 0;
      padding-left: 18px;
      color: #ffd6d6;
      font-size: 0.82rem;
      line-height: 1.35;
      max-height: 150px;
      overflow-y: auto;
    }

    .validation-list li + li {
      margin-top: 5px;
    }

    .validation-list code {
      color: #ffd6d6;
      background: transparent;
      font-size: 0.8rem;
    }

    .hidden {
      display: none;
    }

    .path-display {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(5, 13, 24, 0.82);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 11px;
      font: inherit;
      min-height: 42px;
      display: flex;
      align-items: center;
      line-height: 1.3;
      word-break: break-all;
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .actions {
      border-top: 1px solid var(--line);
      padding: 14px 22px 18px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
    }

    .credit-footer {
      border-top: 1px solid var(--line);
      padding: 12px 22px 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      color: var(--muted);
      font-size: 0.8rem;
    }

    .credit-footer strong {
      color: #d8e7ff;
      font-weight: 600;
    }

    button {
      border: 1px solid transparent;
      border-radius: 10px;
      color: #03151f;
      background: linear-gradient(120deg, var(--accent), #44e2c5);
      padding: 10px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform 130ms ease, filter 130ms ease;
    }

    button:hover {
      transform: translateY(-1px);
      filter: brightness(1.04);
    }

    button.secondary {
      color: var(--text);
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.25);
    }

    button.ghost {
      color: #ffd6d6;
      background: rgba(255, 111, 111, 0.12);
      border-color: rgba(255, 111, 111, 0.36);
    }

    .status {
      margin-right: auto;
      font-size: 0.88rem;
      color: var(--muted);
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 160ms ease, transform 160ms ease;
    }

    .status.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .status.error {
      color: var(--danger);
    }

    @media (max-width: 860px) {
      .grid {
        grid-template-columns: 1fr;
      }
      .hero {
        flex-direction: column;
        align-items: flex-start;
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

    <section class="grid">
      <article class="card full">
        <div class="row">
          <div>
            <label>Enable Faah</label>
            <div class="hint">Turn error sound monitoring on or off.</div>
          </div>
          <button id="enabledSwitch" class="switch" type="button" aria-label="Toggle enabled"><span></span></button>
        </div>
      </article>

      <article class="card full">
        <label>Detection Sources</label>
        <div class="row">
          <div>
            <div>Terminal Output</div>
            <div class="hint">Play alerts for terminal command output.</div>
          </div>
          <button id="monitorTerminalSwitch" class="switch" type="button" aria-label="Toggle terminal monitoring"><span></span></button>
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

      <article class="card">
        <label>Volume</label>
        <div class="volume-row">
          <input id="volumePercent" type="range" min="0" max="100" step="5" />
          <div id="volumeLabel" class="value-badge">70%</div>
        </div>
        <div class="hint">0% is mute and 100% is max.</div>
      </article>

      <article class="card">
        <label for="saveTarget">Save Scope</label>
        <select id="saveTarget" aria-label="Save scope">
          <option value="global" selected>User (Global)</option>
          ${hasWorkspace ? '<option value="workspace">Workspace</option>' : ""}
        </select>
        <div class="hint">
          ${
            hasWorkspace
              ? "Choose where settings are stored when you click Save Changes."
              : "No workspace open. Settings will be saved to user settings."
          }
        </div>
      </article>

      <article class="card">
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

      <article class="card">
        <label>Custom Sound (optional)</label>
        <div id="customSoundPathDisplay" class="path-display" role="status" aria-live="polite"></div>
        <div class="hint">Upload/select a sound file to override default playback.</div>
        <div class="hint">Use default to return to bundled <code>faah</code>.</div>
        <div class="button-row">
          <button class="secondary" id="uploadSoundBtn" type="button">Upload Sound File</button>
          <button class="secondary" id="useDefaultSoundBtn" type="button">Use Default (faah)</button>
        </div>
      </article>

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
        <label>Regex Validation Preview</label>
        <p id="regexValidationSummary" class="validation-summary">No patterns to validate yet.</p>
        <ul id="invalidPatternList" class="validation-list hidden" aria-label="Invalid custom patterns"></ul>
        <ul id="invalidExcludePatternList" class="validation-list hidden" aria-label="Invalid exclude patterns"></ul>
      </article>
    </section>

    <section class="actions">
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <button class="ghost" id="resetBtn" type="button">Reset Defaults</button>
      <button class="secondary" id="testBtn" type="button">Play Test Sound</button>
      <button id="saveBtn" type="button">Save Changes</button>
    </section>

    <section class="credit-footer" aria-label="Credits">
      <div><strong>Developed by:</strong> Toufiq Hasan Kiron</div>
      <div><strong>Idea:</strong> Md Shoaib Taimur</div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const defaults = ${JSON.stringify(defaultStoredSettings).replace(/</g, "\\u003c")};
    const initial = ${bootSettings};
    const hasWorkspace = ${JSON.stringify(hasWorkspace)};

    const ui = {
      enabledSwitch: document.getElementById("enabledSwitch"),
      monitorTerminalSwitch: document.getElementById("monitorTerminalSwitch"),
      monitorDiagnosticsSwitch: document.getElementById("monitorDiagnosticsSwitch"),
      diagnosticsSeverity: document.getElementById("diagnosticsSeverity"),
      terminalCooldownMs: document.getElementById("terminalCooldownMs"),
      terminalCooldownLabel: document.getElementById("terminalCooldownLabel"),
      diagnosticsCooldownMs: document.getElementById("diagnosticsCooldownMs"),
      diagnosticsCooldownLabel: document.getElementById("diagnosticsCooldownLabel"),
      volumePercent: document.getElementById("volumePercent"),
      volumeLabel: document.getElementById("volumeLabel"),
      customSoundPathDisplay: document.getElementById("customSoundPathDisplay"),
      uploadSoundBtn: document.getElementById("uploadSoundBtn"),
      useDefaultSoundBtn: document.getElementById("useDefaultSoundBtn"),
      quietHoursSwitch: document.getElementById("quietHoursSwitch"),
      quietHoursStart: document.getElementById("quietHoursStart"),
      quietHoursEnd: document.getElementById("quietHoursEnd"),
      patternModeOverride: document.getElementById("patternModeOverride"),
      patternModeAppend: document.getElementById("patternModeAppend"),
      patterns: document.getElementById("patterns"),
      excludePatterns: document.getElementById("excludePatterns"),
      regexValidationSummary: document.getElementById("regexValidationSummary"),
      invalidPatternList: document.getElementById("invalidPatternList"),
      invalidExcludePatternList: document.getElementById("invalidExcludePatternList"),
      appendReadonlyWrap: document.getElementById("appendReadonlyWrap"),
      builtInPatternsList: document.getElementById("builtInPatternsList"),
      saveTarget: document.getElementById("saveTarget"),
      saveBtn: document.getElementById("saveBtn"),
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
    let customSoundPath = "";
    let quietHoursEnabled = false;
    let invalidRegexCount = 0;
    let statusTimer = null;
    let pillTimer = null;
    let autoSaveTimer = null;
    let suppressNextSavedStatus = false;
    let saveInFlight = false;
    let activeSaveMode = "manual";
    let queuedSaveMode = null;
    let queuedSaveForce = false;
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
      quietHoursEnabled = !!settings.quietHoursEnabled;
      setSwitchState(ui.enabledSwitch, enabled);
      setSwitchState(ui.monitorTerminalSwitch, monitorTerminal);
      setSwitchState(ui.monitorDiagnosticsSwitch, monitorDiagnostics);
      setSwitchState(ui.quietHoursSwitch, quietHoursEnabled);
      ui.diagnosticsSeverity.value =
        settings.diagnosticsSeverity === "warningAndError" ? "warningAndError" : "error";
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
        quietHoursEnabled,
        diagnosticsSeverity:
          ui.diagnosticsSeverity.value === "warningAndError" ? "warningAndError" : "error",
        cooldownMs: Math.max(terminalCooldownMs, diagnosticsCooldownMs),
        terminalCooldownMs,
        diagnosticsCooldownMs,
        volumePercent: Number.isFinite(volumeRaw) ? Math.min(100, Math.max(0, Math.round(volumeRaw))) : 70,
        customSoundPath: customSoundPath.trim(),
        quietHoursStart: ui.quietHoursStart.value || "22:00",
        quietHoursEnd: ui.quietHoursEnd.value || "07:00",
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
      if (pillTimer) clearTimeout(pillTimer);
      pillTimer = setTimeout(() => {
        ui.pillStatus.textContent = defaultPillMessage;
        ui.pillStatus.classList.remove("error");
      }, 2200);
    }

    function flashStatus(text, kind = "ok") {
      ui.status.textContent = text;
      ui.status.classList.toggle("error", kind === "error");
      ui.status.classList.add("visible");
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        ui.status.classList.remove("visible");
      }, 2200);
      flashPill(text, kind);
    }

    function queueSave(mode, force) {
      if (mode === "manual") {
        queuedSaveMode = "manual";
        queuedSaveForce = true;
        return;
      }

      if (queuedSaveMode === "manual") return;
      queuedSaveMode = "auto";
      queuedSaveForce = !!force;
    }

    function flushQueuedSave() {
      if (!queuedSaveMode) return;
      const mode = queuedSaveMode;
      const force = queuedSaveForce;
      queuedSaveMode = null;
      queuedSaveForce = false;
      requestSave(mode, force);
    }

    function requestSave(mode = "manual", force = false, explicitPayload) {
      const payload = explicitPayload || collectSettings();
      const signature = createSettingsSignature(payload);
      const invalidEntriesPresent = invalidRegexCount > 0;

      if (!force && mode === "auto" && invalidEntriesPresent) {
        flashPill("Fix invalid regex entries to resume auto-save.", "error");
        return false;
      }
      if (!force && mode === "auto" && signature === latestSavedSignature) return false;

      if (saveInFlight) {
        queueSave(mode, force);
        return false;
      }

      saveInFlight = true;
      activeSaveMode = mode;
      vscode.postMessage({ type: "save", payload, target: getPersistTarget() });
      return true;
    }

    function scheduleAutoSave(delay = autoSaveDebounceMs) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        requestSave("auto");
      }, delay);
    }

    function markChanged(delay = autoSaveDebounceMs) {
      flashPill("Changes detected. Auto-saving...");
      scheduleAutoSave(delay);
    }

    ui.enabledSwitch.addEventListener("click", () => {
      enabled = !enabled;
      setSwitchState(ui.enabledSwitch, enabled);
      markChanged();
    });
    ui.monitorTerminalSwitch.addEventListener("click", () => {
      monitorTerminal = !monitorTerminal;
      setSwitchState(ui.monitorTerminalSwitch, monitorTerminal);
      markChanged();
    });
    ui.monitorDiagnosticsSwitch.addEventListener("click", () => {
      monitorDiagnostics = !monitorDiagnostics;
      setSwitchState(ui.monitorDiagnosticsSwitch, monitorDiagnostics);
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

    ui.saveBtn.addEventListener("click", () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      requestSave("manual", true);
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
      suppressNextSavedStatus = true;
      applySettings(resetSettings);
      requestSave("manual", true, resetSettings);
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;

      if (message.type === "saved") {
        saveInFlight = false;
        const savedSettings = message.payload || initial;
        latestSavedSignature = createSettingsSignature(savedSettings);
        applySettings(savedSettings);
        if (suppressNextSavedStatus) {
          suppressNextSavedStatus = false;
          flushQueuedSave();
          return;
        }
        const targetLabel = message.target === "workspace" ? "workspace" : "user";
        if (activeSaveMode === "auto") {
          flashStatus("Changes auto-saved to " + targetLabel + " settings");
        } else {
          flashStatus("Saved to " + targetLabel + " settings");
        }
        flushQueuedSave();
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

      if (message.type === "error") {
        saveInFlight = false;
        queuedSaveMode = null;
        queuedSaveForce = false;
        suppressNextSavedStatus = false;
        flashStatus(String(message.payload || "Failed to save settings"), "error");
      }
    });

    applySettings(initial);
    latestSavedSignature = createSettingsSignature(collectSettings());
  </script>
</body>
</html>`;
}

export function registerSettingsUiCommand(
  context: vscode.ExtensionContext,
  getStoredSettings: () => StoredSettings,
  onSaved: (settings: StoredSettings, target: SettingsPersistTarget) => Promise<void>,
  onTest: (settings: StoredSettings) => void,
  commandId = commandIds.openSettingsUi,
): vscode.Disposable {
  let panel: vscode.WebviewPanel | undefined;

  const commandDisposable = vscode.commands.registerCommand(commandId, async () => {
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      panel.webview.html = renderSettingsWebview(panel.webview, context, getStoredSettings(), hasWorkspace);
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
    const panelIconPath = vscode.Uri.joinPath(context.extensionUri, "images", "icon.png");
    panel.iconPath = {
      light: panelIconPath,
      dark: panelIconPath,
    };

    panel.webview.html = renderSettingsWebview(panel.webview, context, getStoredSettings(), hasWorkspace);

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
          panel?.webview.postMessage({ type: "selectedSoundFile", payload: selectedPath });
        }
        return;
      }

      if (message.type === "test") {
        const normalized = normalizeStoredSettings((message.payload ?? {}) as Partial<StoredSettings>);
        onTest(normalized);
        return;
      }

      if (message.type !== "save") return;

      try {
        const normalized = normalizeStoredSettings((message.payload ?? {}) as Partial<StoredSettings>);
        const persistTarget: SettingsPersistTarget =
          message.target === "workspace" && hasWorkspace ? "workspace" : "global";
        await onSaved(normalized, persistTarget);
        panel?.webview.postMessage({ type: "saved", payload: normalized, target: persistTarget });
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        panel?.webview.postMessage({ type: "error", payload: messageText });
      }
    });
  });

  const configurationDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!panel) return;
    if (!event.affectsConfiguration("faah")) return;
    panel.webview.postMessage({
      type: "externalSettingsUpdated",
      payload: getStoredSettings(),
    });
  });

  return vscode.Disposable.from(commandDisposable, configurationDisposable);
}
