<div align="center">
  <img src="images/icon.png" alt="Faah Icon" width="140" />

  # Faah

  ### Your Command-Line Drama Alarm for VS Code

  When your terminal screams, Faah screams louder.

  <p>
    <img src="https://img.shields.io/badge/VS%20Code-1.100.0%2B-0ea5e9?style=for-the-badge&logo=visualstudiocode&logoColor=white" />
    <img src="https://img.shields.io/badge/Version-0.0.1-111827?style=for-the-badge" />
    <img src="https://img.shields.io/badge/License-MIT-16a34a?style=for-the-badge" />
  </p>
</div>

---

## Overview

**Faah** is a lightweight VS Code extension that listens to your terminal output and plays a sound whenever an error appears.

No more silent failures.
No more unnoticed broken builds.
No more cursed command output.

If your terminal output gets dramatic — **Faah gets louder.**

---

## Features

- Plays a sound (`faah`) when terminal output matches error patterns
- Lightweight and fast
- Regex-based error detection
- Cooldown system to prevent spam
- Fully configurable patterns
- Works with terminal commands and build tools

---

## Configuration

Faah now uses a dedicated visual settings dashboard.

Open Command Palette and run:

`Faah: Open Settings UI`

From the UI, users can control:

- Enable/disable monitoring
- Cooldown in milliseconds
- Volume (`0` to `100`)
- Pattern mode (`override` or `append`)
- Regex patterns list (one per line)
- Save/reset and quick test playback

---

## Use Case

Faah is perfect when you:

* Run long build commands
* Work with noisy logs
* Switch tabs while compiling
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
