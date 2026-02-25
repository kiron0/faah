import * as vscode from "vscode";

import { commandIds } from "./commands";
import {
  defaultStoredSettings,
  normalizeStoredSettings,
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
      white-space: nowrap;
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

    .hidden {
      display: none;
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
      <div class="pill">All changes are saved instantly for this extension</div>
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
        <label for="cooldownMs">Cooldown (ms)</label>
        <div class="volume-row">
          <input id="cooldownMs" type="range" min="500" max="10000" step="100" />
          <div id="cooldownLabel" class="value-badge">1500ms</div>
        </div>
        <div class="hint">Minimum delay between two alerts (minimum 500ms).</div>
      </article>

      <article class="card">
        <label>Volume</label>
        <div class="volume-row">
          <input id="volumePercent" type="range" min="0" max="100" step="5" />
          <div id="volumeLabel" class="value-badge">70%</div>
        </div>
        <div class="hint">0% is mute and 100% is max.</div>
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

    const ui = {
      enabledSwitch: document.getElementById("enabledSwitch"),
      monitorTerminalSwitch: document.getElementById("monitorTerminalSwitch"),
      monitorDiagnosticsSwitch: document.getElementById("monitorDiagnosticsSwitch"),
      diagnosticsSeverity: document.getElementById("diagnosticsSeverity"),
      cooldownMs: document.getElementById("cooldownMs"),
      cooldownLabel: document.getElementById("cooldownLabel"),
      volumePercent: document.getElementById("volumePercent"),
      volumeLabel: document.getElementById("volumeLabel"),
      patternModeOverride: document.getElementById("patternModeOverride"),
      patternModeAppend: document.getElementById("patternModeAppend"),
      patterns: document.getElementById("patterns"),
      excludePatterns: document.getElementById("excludePatterns"),
      appendReadonlyWrap: document.getElementById("appendReadonlyWrap"),
      builtInPatternsList: document.getElementById("builtInPatternsList"),
      saveBtn: document.getElementById("saveBtn"),
      testBtn: document.getElementById("testBtn"),
      resetBtn: document.getElementById("resetBtn"),
      status: document.getElementById("status"),
    };

    let enabled = true;
    let monitorTerminal = true;
    let monitorDiagnostics = true;
    let statusTimer = null;
    let suppressNextSavedStatus = false;

    function setSwitchState(element, isOn) {
      element.classList.toggle("on", isOn);
    }

    function syncCooldownLabel() {
      ui.cooldownLabel.textContent = ui.cooldownMs.value + "ms";
    }

    function applySettings(settings) {
      enabled = !!settings.enabled;
      monitorTerminal = !!settings.monitorTerminal;
      monitorDiagnostics = !!settings.monitorDiagnostics;
      setSwitchState(ui.enabledSwitch, enabled);
      setSwitchState(ui.monitorTerminalSwitch, monitorTerminal);
      setSwitchState(ui.monitorDiagnosticsSwitch, monitorDiagnostics);
      ui.diagnosticsSeverity.value =
        settings.diagnosticsSeverity === "warningAndError" ? "warningAndError" : "error";
      ui.cooldownMs.value = String(Math.max(500, settings.cooldownMs ?? 1500));
      ui.volumePercent.value = String(settings.volumePercent ?? 70);
      const patternMode = settings.patternMode === "append" ? "append" : "override";
      setPatternMode(patternMode, false);
      ui.patterns.value =
        patternMode === "override" && Array.isArray(settings.patterns)
          ? settings.patterns.join("\\n")
          : "";
      ui.excludePatterns.value = Array.isArray(settings.excludePatterns)
        ? settings.excludePatterns.join("\\n")
        : "";
      syncCooldownLabel();
      syncVolumeLabel();
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

    function setPatternMode(mode, clearCustom = true) {
      const isAppend = mode === "append";
      ui.patternModeAppend.checked = isAppend;
      ui.patternModeOverride.checked = !isAppend;
      if (clearCustom) {
        ui.patterns.value = "";
      }
      ui.appendReadonlyWrap.classList.toggle("hidden", !isAppend);
      renderBuiltInPatternsList();
    }

    function collectSettings() {
      const cooldownRaw = Number(ui.cooldownMs.value);
      const volumeRaw = Number(ui.volumePercent.value);
      return {
        enabled,
        monitorTerminal,
        monitorDiagnostics,
        diagnosticsSeverity:
          ui.diagnosticsSeverity.value === "warningAndError" ? "warningAndError" : "error",
        cooldownMs: Number.isFinite(cooldownRaw) ? Math.max(500, Math.round(cooldownRaw)) : 1500,
        volumePercent: Number.isFinite(volumeRaw) ? Math.min(100, Math.max(0, Math.round(volumeRaw))) : 70,
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

    function flashStatus(text, kind = "ok") {
      ui.status.textContent = text;
      ui.status.classList.toggle("error", kind === "error");
      ui.status.classList.add("visible");
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        ui.status.classList.remove("visible");
      }, 2200);
    }

    ui.enabledSwitch.addEventListener("click", () => {
      enabled = !enabled;
      setSwitchState(ui.enabledSwitch, enabled);
    });
    ui.monitorTerminalSwitch.addEventListener("click", () => {
      monitorTerminal = !monitorTerminal;
      setSwitchState(ui.monitorTerminalSwitch, monitorTerminal);
    });
    ui.monitorDiagnosticsSwitch.addEventListener("click", () => {
      monitorDiagnostics = !monitorDiagnostics;
      setSwitchState(ui.monitorDiagnosticsSwitch, monitorDiagnostics);
    });

    ui.volumePercent.addEventListener("input", syncVolumeLabel);
    ui.cooldownMs.addEventListener("input", syncCooldownLabel);
    ui.patternModeOverride.addEventListener("change", () => {
      if (!ui.patternModeOverride.checked) return;
      setPatternMode("override");
    });
    ui.patternModeAppend.addEventListener("change", () => {
      if (!ui.patternModeAppend.checked) return;
      setPatternMode("append");
    });

    ui.saveBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "save", payload: collectSettings() });
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
      vscode.postMessage({ type: "save", payload: resetSettings });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;

      if (message.type === "saved") {
        applySettings(message.payload || initial);
        if (suppressNextSavedStatus) {
          suppressNextSavedStatus = false;
          return;
        }

        flashStatus("Saved");
      }

      if (message.type === "error") {
        suppressNextSavedStatus = false;
        flashStatus(String(message.payload || "Failed to save settings"), "error");
      }
    });

    applySettings(initial);
  </script>
</body>
</html>`;
}

export function registerSettingsUiCommand(
  context: vscode.ExtensionContext,
  getStoredSettings: () => StoredSettings,
  onSaved: (settings: StoredSettings) => Promise<void>,
  onTest: (settings: StoredSettings) => void,
  commandId = commandIds.openSettingsUi,
): vscode.Disposable {
  let panel: vscode.WebviewPanel | undefined;

  return vscode.commands.registerCommand(commandId, async () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      panel.webview.html = renderSettingsWebview(panel.webview, context, getStoredSettings());
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

    panel.webview.html = renderSettingsWebview(panel.webview, context, getStoredSettings());

    panel.onDidDispose(() => {
      panel = undefined;
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message.type !== "string") return;

      if (message.type === "test") {
        const normalized = normalizeStoredSettings((message.payload ?? {}) as Partial<StoredSettings>);
        onTest(normalized);
        return;
      }

      if (message.type !== "save") return;

      try {
        const normalized = normalizeStoredSettings((message.payload ?? {}) as Partial<StoredSettings>);
        await onSaved(normalized);
        panel?.webview.postMessage({ type: "saved", payload: normalized });
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        panel?.webview.postMessage({ type: "error", payload: messageText });
      }
    });
  });
}
