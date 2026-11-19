/* Copyright Advanced Software and AI Solutions LLC */
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { venvScriptsDir } from './paths.js';

export class SpawnGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpawnGuardError';
  }
}

const BASE_ALLOW = new Set(['uv', 'git', 'taskkill']);

export type SpawnRequest = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  registeredVenvDir?: string;
  allowPython?: boolean;
};

function basenameCommand(command: string): string {
  return path.basename(command).toLowerCase().replace(/\.exe$/i, '');
}

export function assertSafeArgs(args: string[]): void {
  for (const arg of args) {
    if (arg.startsWith('-')) {
      // Flags for allowlisted tools are OK when the caller is internal.
      // User-supplied values are validated before they become args.
    }
    if (arg.includes('\0')) {
      throw new SpawnGuardError('Argument must not contain NUL');
    }
  }
}

export function assertAllowlistedCommand(
  command: string,
  options: { registeredVenvDir?: string; allowPython?: boolean } = {},
): void {
  const base = basenameCommand(command);
  if (BASE_ALLOW.has(base)) return;

  if (options.registeredVenvDir) {
    const scripts = venvScriptsDir(options.registeredVenvDir);
    const realScripts = fs.existsSync(scripts) ? fs.realpathSync(scripts) : scripts;
    const realCommand = fs.existsSync(command) ? fs.realpathSync(command) : path.resolve(command);
    const scriptsNorm =
      process.platform === 'win32' ? realScripts.toLowerCase() : realScripts;
    const cmdNorm = process.platform === 'win32' ? realCommand.toLowerCase() : realCommand;
    if (cmdNorm.startsWith(scriptsNorm + path.sep) || cmdNorm.startsWith(scriptsNorm + '/')) {
      if (process.platform === 'win32') {
        if (!command.toLowerCase().endsWith('.exe') && base !== 'python') {
          throw new SpawnGuardError('On Windows only .exe entry points are allowed');
        }
      }
      return;
    }
    if (options.allowPython && (base === 'python' || base === 'python3')) {
      const expected = process.platform === 'win32' ? 'python.exe' : 'python';
      if (path.basename(command).toLowerCase() === expected || base === 'python3') {
        const venvPython = path.join(
          options.registeredVenvDir,
          process.platform === 'win32' ? 'Scripts' : 'bin',
          process.platform === 'win32' ? 'python.exe' : 'python',
        );
        const realExpected = fs.existsSync(venvPython)
          ? fs.realpathSync(venvPython)
          : path.resolve(venvPython);
        if (
          (process.platform === 'win32' ? realCommand.toLowerCase() : realCommand) ===
          (process.platform === 'win32' ? realExpected.toLowerCase() : realExpected)
        ) {
          return;
        }
      }
    }
  }

  throw new SpawnGuardError(`Command not allowlisted: ${base}`);
}

export function spawnAllowlisted(
  request: SpawnRequest,
  options: SpawnOptions = {},
): ChildProcessWithoutNullStreams {
  assertAllowlistedCommand(request.command, {
    registeredVenvDir: request.registeredVenvDir,
    allowPython: request.allowPython,
  });
  assertSafeArgs(request.args);
  // Never join args into a shell string.
  return spawn(request.command, request.args, {
    shell: false,
    cwd: request.cwd,
    env: request.env ?? process.env,
    windowsHide: true,
    ...options,
  }) as ChildProcessWithoutNullStreams;
}

export function resolveEntryPoint(
  venvDir: string,
  entryName: string,
): { command: string; args: string[]; registeredVenvDir: string; allowPython: boolean } {
  if (entryName.startsWith('-')) {
    throw new SpawnGuardError('Entry point must not start with a hyphen');
  }
  const scripts = venvScriptsDir(venvDir);
  if (process.platform === 'win32') {
    const exe = path.join(scripts, `${entryName}.exe`);
    if (fs.existsSync(exe)) {
      return { command: exe, args: [], registeredVenvDir: venvDir, allowPython: false };
    }
    throw new SpawnGuardError(`Entry point not found: ${entryName}.exe`);
  }
  const scriptPath = path.join(scripts, entryName);
  if (fs.existsSync(scriptPath)) {
    return { command: scriptPath, args: [], registeredVenvDir: venvDir, allowPython: false };
  }
  const python = path.join(scripts, 'python');
  return {
    command: python,
    args: [scriptPath],
    registeredVenvDir: venvDir,
    allowPython: true,
  };
}

export async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const child = spawnAllowlisted({
        command: 'taskkill',
        args: ['/PID', String(pid), '/T', '/F'],
      });
      child.on('exit', () => resolve());
      child.on('error', () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

export function runCapture(
  command: string,
  args: string[],
  options: { cwd?: string; registeredVenvDir?: string; allowPython?: boolean; timeoutMs?: number } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnAllowlisted(
        {
          command,
          args,
          cwd: options.cwd,
          registeredVenvDir: options.registeredVenvDir,
          allowPython: options.allowPython,
        },
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            void killProcessTree(child.pid ?? 0);
          }, options.timeoutMs)
        : undefined;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
