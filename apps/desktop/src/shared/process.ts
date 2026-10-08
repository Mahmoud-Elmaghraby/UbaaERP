import { spawn, type SpawnOptions } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export const IS_WINDOWS = process.platform === 'win32';

/** Runs a command to completion (no shell — arguments are passed verbatim). */
export function run(command: string, args: string[], options: SpawnOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Like run(), but a non-zero exit is an error carrying the command's own output. */
export async function runChecked(command: string, args: string[], options: SpawnOptions = {}): Promise<RunResult> {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(`${command} ${args[0] ?? ''} failed (exit ${result.code})${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

/**
 * Environment for running one of the app's own JS entry points with the
 * app's executable as a plain Node.js runtime — Electron ships Node, so the
 * customer's machine needs no separate Node.js install (نبغة installed a
 * Node MSI, and once launched itself instead of node.exe when the lookup
 * fell back to guessing — the "second white window" incident).
 */
export function nodeRuntimeEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extra };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
