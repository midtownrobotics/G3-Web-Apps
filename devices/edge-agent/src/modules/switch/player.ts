export interface SoundPlayer {
  play(path?: string): Promise<string>;
}

export function soundCommand(player: string, device: string, sound: string) {
  return [player, "-q", "-D", device, sound];
}

/** Plays configured sounds in rotation, without invoking a shell. */
export function createSoundPlayer(
  player: string,
  device: string,
  sounds: () => Promise<string[]>,
): SoundPlayer {
  let next = 0;
  let queue: Promise<unknown> = Promise.resolve();

  return {
    play(path) {
      const task = queue.then(async () => {
        const available = path ? [path] : await sounds();
        if (available.length === 0) throw new Error("No switch sounds are configured.");
        const sound = available[next++ % available.length];
        const process = Bun.spawn(soundCommand(player, device, sound), {
          stdout: "ignore",
          stderr: "pipe",
        });
        const exitCode = await process.exited;
        if (exitCode !== 0) {
          const error = await new Response(process.stderr).text();
          throw new Error(`${player} exited ${exitCode}: ${error.trim() || "unknown error"}`);
        }
        return sound;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}

export function createMockSoundPlayer(sounds: () => Promise<string[]>): SoundPlayer {
  let next = 0;
  return {
    async play(path) {
      const available = path ? [path] : await sounds();
      if (available.length === 0) throw new Error("No switch sounds are configured.");
      return available[next++ % available.length];
    },
  };
}
