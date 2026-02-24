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

- Plays a custom sound (`faah`) when terminal output matches error patterns
- Lightweight and fast
- Regex-based error detection
- Cooldown system to prevent spam
- Fully configurable patterns
- Works with terminal commands and build tools

---

## Configuration

You can configure Faah from VS Code settings:

### Available Settings

| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `terminalErrorSound.enabled` | boolean | `true` | Enable or disable Faah |
| `terminalErrorSound.cooldownMs` | number | `1500` | Minimum delay between sound triggers |
| `terminalErrorSound.patterns` | string[] | Built-in patterns | Regex patterns that trigger the sound |

### Default Error Patterns

```json
[
  "\\berror\\b",
  "\\bfailed\\b",
  "ERR!",
  "UnhandledPromiseRejection",
  "Exception",
  "Segmentation fault"
]
````

You can add your own patterns for specific tools like:

* `npm`
* `pnpm`
* `yarn`
* `gcc`
* `python`
* `docker`
* `make`
* custom scripts

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
Md Shoaaib Taimur

## 📄 License

MIT License © Toufiq Hasan Kiron
