/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapture } from './spawn.js';
import { appDir, appVenvDir, projectVenvDir, venvPython } from './paths.js';
import type { InstallSource } from './validators.js';
import { normalizeInstallSource, parseSlug } from './validators.js';

export type InstallProgress = (chunk: string) => void;

function helperPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'inspect_helper.py');
}

async function runUv(
  args: string[],
  onLog?: InstallProgress,
  registeredVenvDir?: string,
): Promise<void> {
  const result = await runCapture('uv', args, { registeredVenvDir });
  if (result.stdout && onLog) onLog(result.stdout);
  if (result.stderr && onLog) onLog(result.stderr);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `uv exited with ${result.code}`);
  }
}

export async function createVenv(
  venvDir: string,
  python?: string,
  onLog?: InstallProgress,
): Promise<void> {
  fs.mkdirSync(path.dirname(venvDir), { recursive: true });
  const args = ['venv', venvDir];
  if (python) {
    if (python.startsWith('-')) throw new Error('Python selector must not start with a hyphen');
    args.push('--python', python);
  }
  await runUv(args, onLog);
}

export async function pipInstall(
  venvDir: string,
  installArg: string,
  editable: boolean,
  onLog?: InstallProgress,
): Promise<void> {
  const args = ['pip', 'install', '--python', venvPython(venvDir)];
  if (editable) args.push('-e');
  args.push(installArg);
  await runUv(args, onLog, venvDir);
}

export async function inspectPackage(
  venvDir: string,
  packageName: string,
): Promise<{ version: string | null; entry_points: string[] }> {
  const python = venvPython(venvDir);
  const result = await runCapture(
    python,
    [helperPath(), packageName],
    { registeredVenvDir: venvDir, allowPython: true },
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || 'Failed to inspect package');
  }
  const parsed = JSON.parse(result.stdout) as {
    version: string | null;
    entry_points: string[];
  };
  return { version: parsed.version, entry_points: parsed.entry_points ?? [] };
}

export function packageNameFromRequirement(requirement: string): string {
  return requirement.replace(/\[.*$/, '').replace(/[<=>!~].*$/, '').trim();
}

export async function installApp(options: {
  home: string;
  slug: string;
  name: string;
  source: InstallSource;
  python?: string;
  onLog?: InstallProgress;
}): Promise<{
  slug: string;
  venv_path: string;
  version: string | null;
  entry_points: string[];
  source_type: string;
  source_value: string;
}> {
  const slug = parseSlug(options.slug);
  const normalized = normalizeInstallSource(options.source);
  const dir = appDir(options.home, slug);
  const venvDir = appVenvDir(options.home, slug);
  fs.mkdirSync(dir, { recursive: true });
  await createVenv(venvDir, options.python, options.onLog);
  await pipInstall(venvDir, normalized.installArg, normalized.editable, options.onLog);
  const pkgName =
    normalized.type === 'pypi'
      ? packageNameFromRequirement(normalized.value)
      : slug;
  const inspected = await inspectPackage(venvDir, pkgName);
  return {
    slug,
    venv_path: venvDir,
    version: inspected.version,
    entry_points: inspected.entry_points,
    source_type: normalized.type,
    source_value: normalized.value,
  };
}

export async function installProject(options: {
  folder: string;
  editable?: boolean;
  python?: string;
  onLog?: InstallProgress;
}): Promise<{
  venv_path: string;
  version: string | null;
  entry_points: string[];
}> {
  const folder = path.resolve(options.folder);
  const venvDir = projectVenvDir(folder);
  await createVenv(venvDir, options.python, options.onLog);
  const hasReq = fs.existsSync(path.join(folder, 'requirements.txt'));
  const hasPyproject = fs.existsSync(path.join(folder, 'pyproject.toml'));
  if (hasPyproject) {
    await pipInstall(venvDir, folder, Boolean(options.editable), options.onLog);
  } else if (hasReq) {
    await runUv(
      ['pip', 'install', '--python', venvPython(venvDir), '-r', path.join(folder, 'requirements.txt')],
      options.onLog,
      venvDir,
    );
  } else {
    throw new Error('Project needs pyproject.toml or requirements.txt');
  }
  const inspected = await inspectPackage(venvDir, path.basename(folder));
  return {
    venv_path: venvDir,
    version: inspected.version,
    entry_points: inspected.entry_points,
  };
}

export async function repairApp(options: {
  home: string;
  slug: string;
  source: InstallSource;
  python?: string;
  onLog?: InstallProgress;
  name: string;
}): Promise<Awaited<ReturnType<typeof installApp>>> {
  const venvDir = appVenvDir(options.home, options.slug);
  if (fs.existsSync(venvDir)) {
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
  return installApp(options);
}
