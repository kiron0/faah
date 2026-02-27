<div align="center">
  <img src="images/icon.png" alt="Faah Icon" width="140" />

  # Faah - Error Alerts

  ### Your Error Drama Alarm for VS Code

  Never miss errors in VS Code. Faah plays instant alerts for terminal failures and editor diagnostics, with one-click status bar controls.

  <p>
    <img src="https://img.shields.io/badge/VS%20Code-1.109.0%2B-0ea5e9?style=for-the-badge&logo=visualstudiocode&logoColor=white" />
    <img src="https://img.shields.io/badge/License-MIT-16a34a?style=for-the-badge" />
  </p>

  <p>
    For more: <a href="https://faah.js.org">Faah Official Docs</a>
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
- Auto-save settings in the Control Room, with manual Save Changes fallback
- Status bar indicator with source-aware quick actions
- Fully configurable patterns
- Works smoothly across your coding workflow

---

## Configuration

Use Faah from the status bar quick actions or Command Palette.

1. In VS Code, click `Faah Off`, `Faah T`, `Faah E`, or `Faah T+E` in the bottom bar.
2. Choose what you want: turn Faah on/off, select terminal/editor/both, switch error mode, snooze alerts, set quiet hours, play test sound, or open full settings.
3. In Settings UI, changes auto-save after edits; `Save Changes` is still available for manual save.

Command Palette commands:

- `Faah: Show Quick Actions`
- `Faah: Open Settings`
- `Faah: Play Test Sound`
- `Faah: Snooze Alerts`
- `Faah: Clear Snooze`
- `Faah: Set Quiet Hours`

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
