/* Copyright Advanced Software and AI Solutions LLC */
import path from 'node:path';
import { venvPython } from './paths.js';

export type ShellKind = 'powershell' | 'cmd' | 'bash' | 'zsh';

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteCmd(value: string): string {
  if (!/[ \t"&<>|^]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteBash(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function activateCommand(venvDir: string, shell: ShellKind): string {
  const normalized = path.resolve(venvDir);
  switch (shell) {
    case 'powershell':
      return `. ${quotePowerShell(path.join(normalized, 'Scripts', 'Activate.ps1'))}`;
    case 'cmd':
      return quoteCmd(path.join(normalized, 'Scripts', 'activate.bat'));
    case 'bash':
      return `source ${quoteBash(path.join(normalized, 'bin', 'activate'))}`;
    case 'zsh':
      return `source ${quoteBash(path.join(normalized, 'bin', 'activate'))}`;
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
}

export function pythonPathCommand(venvDir: string, shell: ShellKind): string {
  const python = venvPython(path.resolve(venvDir));
  switch (shell) {
    case 'powershell':
      return quotePowerShell(python);
    case 'cmd':
      return quoteCmd(python);
    case 'bash':
    case 'zsh':
      return quoteBash(python);
    default: {
      const _exhaustive: never = shell;
      return _exhaustive;
    }
  }
}

export function allActivateCommands(venvDir: string): Record<ShellKind, { activate: string; python: string }> {
  const shells: ShellKind[] = ['powershell', 'cmd', 'bash', 'zsh'];
  const out = {} as Record<ShellKind, { activate: string; python: string }>;
  for (const shell of shells) {
    out[shell] = {
      activate: activateCommand(venvDir, shell),
      python: pythonPathCommand(venvDir, shell),
    };
  }
  return out;
}
