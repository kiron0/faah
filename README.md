<div align="center">
  <img src="images/icon.png" alt="Faah Icon" width="140" />

# Faah - Error Alerts

### Your Error Drama Alarm for VS Code

Never miss errors in your editor. Faah plays instant alerts for terminal failures and editor diagnostics, with one-click status bar controls.

  <p>
    <img src="https://img.shields.io/badge/VS%20Code-1.105.0%2B-0ea5e9?style=for-the-badge&logo=visualstudiocode&logoColor=white" />
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
- Lightweight and fast, with regex-based error detection and configurable patterns/excludes
- Separate cooldown controls for terminal and diagnostics sources
- Terminal and editor diagnostics source toggles with diagnostics severity mode
- Terminal detection mode control: output match, non-zero exit code, or either
- Snooze controls (`15m`, `30m`, `1h`, `2h`) and clear snooze action
- Quiet hours presets plus custom `HH:mm` ranges
- Visual alerts (warning popups) plus audio for every alert
- Quick presets (Balanced, Quiet, Aggressive) to snap into a mood
- Built-in false-positive preset packs for common noisy output
- Settings import/export (JSON) for backups or sharing
- Compatibility status command with full/partial/unavailable terminal host reporting
- Workspace-aware settings (`faah.*`) with auto-save Control Room UI
- Status bar indicator with source-aware quick actions

---

## Configuration

Use Faah from the status bar quick actions or Command Palette.

1. In VS Code, click `Faah Off`, `Faah T`, `Faah E`, or `Faah T+E` in the bottom bar.
2. Choose what you want: turn Faah on/off, select terminal/editor/both, switch error mode, snooze alerts, set quiet hours, play test sound, or open full settings.
3. Settings auto-save instantly in the Control Room; use the schedule presets, compatibility button, or import/export buttons for explicit actions.

Faah also applies a tiny shared cross-source guard window so a terminal error and a diagnostics error fired at nearly the same moment do not double-play two alerts back-to-back.
In Control Room, you can also switch terminal detection mode and enable built-in false-positive preset packs.

Command Palette commands:

- `Faah: Show Quick Actions`
- `Faah: Open Settings`
- `Faah: Play Test Sound`
- `Faah: Snooze Alerts`
- `Faah: Clear Snooze`
- `Faah: Set Quiet Hours`
- `Faah: Show Compatibility Status` (raises host compatibility info)

---

## Use Case

Faah is perfect when you:

- Run long tasks
- Work with noisy logs
- Switch tabs while working
- Miss subtle error messages
- Want dramatic feedback while coding 😄

---

## Philosophy

Coding is already dramatic.

Faah just makes sure you hear it.

---

## Authors

- [Md Shoaib Taimur](https://taimur.dev) (Idea)
- [Toufiq Hasan Kiron](https://kiron.dev) (Developer)

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit an issue or a pull request.

## Support

If you have any questions or feedback, please feel free to contact me at [hello@kiron.dev](mailto:hello@kiron.dev).
