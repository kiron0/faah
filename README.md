<div align="center">
  <img src="images/icon.png" alt="Faah Icon" width="140" />

  # Faah

  ### Your Error Drama Alarm for VS Code

  When errors get dramatic, Faah gets louder.

  <p>
    <img src="https://img.shields.io/badge/VS%20Code-1.109.0%2B-0ea5e9?style=for-the-badge&logo=visualstudiocode&logoColor=white" />
    <img src="https://img.shields.io/badge/Version-0.1.3-111827?style=for-the-badge" />
    <img src="https://img.shields.io/badge/License-MIT-16a34a?style=for-the-badge" />
  </p>

  <p>
    For more: <a href="https://faah.kiron.dev">Faah Official Docs</a>
  </p>
</div>

---

## Overview

**Faah** is a lightweight VS Code extension that listens for errors and plays a meme sound when they appear.

Default sound is `faah`, and you can optionally upload/select a custom sound file.

No more silent failures.
No more unnoticed broken builds.
No more cursed error output.

If your errors get dramatic — **Faah gets louder.**

---

## Features

- Plays `faah` by default, with optional uploaded custom sound override
- Lightweight and fast
- Regex-based error detection
- Separate cooldown controls for terminal and diagnostics sources
- Terminal and editor diagnostics source toggles
- Diagnostics severity mode (`Error` or `Error + Warning`)
- Built-in false-positive exclude patterns you can edit
- Regex validation preview in settings UI
- Snooze controls (`15m`, `30m`, `1h`, `2h`) and clear snooze
- Quiet hours (preset or custom `HH:mm` range)
- Workspace-aware settings (`faah.*`) with global fallback
- Status bar indicator with source-aware quick actions
- Fully configurable patterns
- Works smoothly across your coding workflow

---

## Configuration

Use Faah from the status bar quick actions or Command Palette.

1. In VS Code, click `Faah Off`, `Faah T`, `Faah E`, or `Faah T+E` in the bottom bar.
2. Choose what you want: turn Faah on/off, select terminal/editor/both, switch error mode, snooze alerts, set quiet hours, play test sound, or open full settings.

Command Palette commands:

- `Faah: Show Quick Actions`
- `Faah: Open Settings`
- `Faah: Play Test Sound`
- `Faah: Snooze Alerts`
- `Faah: Clear Snooze`
- `Faah: Set Quiet Hours`

---

## Settings Scope

Faah reads and writes settings using VS Code configuration keys under `faah.*`.

- Faah saves to global user settings by default.
- In Settings UI, you can explicitly choose Workspace scope before saving.
- If no workspace is open, User (Global) is the only save target.
- Legacy extension global state is still read as fallback.

Common keys:

```json
{
  "faah.enabled": true,
  "faah.monitorTerminal": true,
  "faah.monitorDiagnostics": true,
  "faah.diagnosticsSeverity": "error",
  "faah.terminalCooldownMs": 1500,
  "faah.diagnosticsCooldownMs": 1500,
  "faah.customSoundPath": "",
  "faah.quietHoursEnabled": false,
  "faah.quietHoursStart": "22:00",
  "faah.quietHoursEnd": "07:00",
  "faah.patternMode": "override",
  "faah.patterns": [],
  "faah.excludePatterns": []
}
```

Notes:

- `patternMode: "override"` uses only your custom patterns.
- `patternMode: "append"` keeps built-in patterns and adds yours.
- `customSoundPath: ""` (empty) uses bundled default `faah`.
- Settings UI supports file-picker upload/selection and stores the resolved file path.
- Invalid regex lines are ignored by detection and shown in the settings validation preview.

---

## Use Case

Faah is perfect when you:

* Run long tasks
* Work with noisy logs
* Switch tabs while working
* Miss subtle error messages
* Want dramatic feedback while coding 😄

---

## Philosophy

Coding is already dramatic.

Faah just makes sure you hear it.

---

## Concept Idea
Md Shoaib Taimur

## License

MIT License © Toufiq Hasan Kiron
