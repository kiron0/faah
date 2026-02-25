import { EventEmitter } from "events";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeSettings } from "../../src/settings";

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

type LoadAudioOptions = {
  fileExists?: boolean;
  spawnCloseCodes?: Array<number | null>;
  playError?: Error;
};

type ModuleMocks = {
  existsSync: ReturnType<typeof vi.fn>;
  showWarningMessage: ReturnType<typeof vi.fn>;
  spawn: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  playSoundFactory: ReturnType<typeof vi.fn>;
};

function createSettings(volumePercent: number): RuntimeSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    cooldownMs: 1500,
    volumePercent,
    patterns: [/error/i],
    excludePatterns: [],
  };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

async function loadAudio(platform: NodeJS.Platform, options: LoadAudioOptions = {}) {
  vi.resetModules();

  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });

  const existsSync = vi.fn(() => options.fileExists ?? true);
  const showWarningMessage = vi.fn();
  const spawnCloseCodes = [...(options.spawnCloseCodes ?? [0])];

  const spawn = vi.fn(() => {
    const proc = new EventEmitter();
    const closeCode = spawnCloseCodes.length > 0 ? spawnCloseCodes.shift() : 0;
    queueMicrotask(() => {
      proc.emit("close", closeCode);
    });
    return proc as any;
  });

  const play = vi.fn((soundPath: string, arg2?: unknown, arg3?: unknown) => {
    const callback =
      typeof arg2 === "function"
        ? (arg2 as (err?: Error) => void)
        : typeof arg3 === "function"
          ? (arg3 as (err?: Error) => void)
          : undefined;

    callback?.(options.playError);
    return soundPath;
  });
  const playSoundFactory = vi.fn(() => ({ play }));

  vi.doMock("fs", () => ({ existsSync }));
  vi.doMock("vscode", () => ({ window: { showWarningMessage } }));
  vi.doMock("child_process", () => ({ spawn }));
  vi.doMock("play-sound", () => ({ default: playSoundFactory }));

  const audio = await import("../../src/audio");

  return {
    audio,
    mocks: {
      existsSync,
      showWarningMessage,
      spawn,
      play,
      playSoundFactory,
    } as ModuleMocks,
  };
}

describe("audio unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("uses play-sound on macOS", async () => {
    const { audio, mocks } = await loadAudio("darwin");

    audio.playAlert(createSettings(100), "media/faah.mp3");

    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
    expect(mocks.playSoundFactory).toHaveBeenCalledWith({});
  });

  it("uses play-sound volume options on Linux", async () => {
    const { audio, mocks } = await loadAudio("linux");

    audio.playAlert(createSettings(40), "media/faah.mp3");

    expect(mocks.play).toHaveBeenCalledTimes(1);
    const call = mocks.play.mock.calls[0];
    expect(call[0]).toBe("media/faah.mp3");
    expect(call[1]).toMatchObject({
      afplay: ["-v", 0.4],
      mplayer: ["-volume", 40],
      play: ["vol", 0.4],
    });
    expect(mocks.playSoundFactory).toHaveBeenCalledWith({
      players: expect.arrayContaining(["paplay", "ffplay", "mpv", "cvlc", "mplayer", "mpg123"]),
    });
  });

  it("uses hidden PowerShell inline playback on Windows", async () => {
    const { audio, mocks } = await loadAudio("win32");

    audio.playAlert(createSettings(70), "media/faah.mp3");

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.play).not.toHaveBeenCalled();
    const [command, args] = mocks.spawn.mock.calls[0];
    expect(command).toBe("powershell");
    expect(args).toEqual(expect.arrayContaining(["-STA", "-Command"]));
    const inlineScript = args[args.length - 1];
    expect(inlineScript).toContain("PresentationCore");
    expect(inlineScript).toContain("System.Windows.Media.MediaPlayer");
  });

  it("warns and skips playback when the sound file is missing", async () => {
    const { audio, mocks } = await loadAudio("linux", { fileExists: false });

    audio.playAlert(createSettings(70), "media/faah.mp3");

    expect(mocks.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("shows Linux install guidance when no audio player is found", async () => {
    const { audio, mocks } = await loadAudio("linux", {
      playError: new Error("Couldn't find a suitable audio player"),
    });

    audio.playAlert(createSettings(70), "media/faah.mp3");

    expect(mocks.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(mocks.showWarningMessage.mock.calls[0][0]).toContain("Install one of");
  });

  it("falls back to console beep if Windows inline player exits with non-zero code", async () => {
    const { audio, mocks } = await loadAudio("win32", { spawnCloseCodes: [1, 0] });

    audio.playAlert(createSettings(70), "media/faah.mp3");
    await flushMicrotasks();

    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    const beepScript = mocks.spawn.mock.calls[1][1].at(-1);
    expect(beepScript).toContain("[console]::Beep(");
  });
});
