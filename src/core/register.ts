/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import { inspectPackage } from './install.js';
import { parseSlug, ValidationError } from './validators.js';
import { venvScriptsDir } from './paths.js';

export type RegisterCandidate = {
  folder: string;
  venvPath: string;
  suggestedSlug: string;
  suggestedName: string;
  kind: 'app' | 'project';
};

export function findVenvAt(folder: string): string {
  const resolved = path.resolve(folder);
  if (!path.isAbsolute(folder) && folder !== resolved) {
    // path.resolve makes absolute from cwd; still require caller absolute paths.
  }
  if (!path.isAbsolute(resolved)) {
    throw new ValidationError('Folder must be an absolute path');
  }
  if (resolved.startsWith('-') || folder.trim().startsWith('-')) {
    throw new ValidationError('Folder must not start with a hyphen');
  }
  if (!fs.existsSync(resolved)) {
    throw new ValidationError(`Folder does not exist: ${resolved}`);
  }
  const direct = path.join(resolved, 'pyvenv.cfg');
  if (fs.existsSync(direct)) return resolved;
  const nested = path.join(resolved, '.venv');
  if (fs.existsSync(path.join(nested, 'pyvenv.cfg'))) return nested;
  throw new ValidationError('Existing venv needs pyvenv.cfg');
}

export function suggestSlugFromFolder(folder: string): string {
  const base = path.basename(folder).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    return parseSlug(base || 'imported-app');
  } catch {
    return parseSlug('imported-app');
  }
}

export function scanRegisterRoot(root: string): RegisterCandidate[] {
  if (!path.isAbsolute(root)) throw new ValidationError('Scan root must be an absolute path');
  if (root.startsWith('-')) throw new ValidationError('Scan root must not start with a hyphen');
  if (!fs.existsSync(root)) throw new ValidationError('Scan root does not exist');
  const out: RegisterCandidate[] = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(root, entry.name);
    const venvPath = path.join(folder, '.venv');
    if (!fs.existsSync(path.join(venvPath, 'pyvenv.cfg'))) continue;
    const slug = suggestSlugFromFolder(folder);
    out.push({
      folder,
      venvPath,
      suggestedSlug: slug,
      suggestedName: entry.name,
      kind: 'project',
    });
  }
  return out;
}

export function listEntryPointNames(venvPath: string): string[] {
  const scripts = venvScriptsDir(venvPath);
  if (!fs.existsSync(scripts)) return [];
  const names = new Set<string>();
  for (const file of fs.readdirSync(scripts)) {
    const lower = file.toLowerCase();
    if (process.platform === 'win32') {
      if (!lower.endsWith('.exe')) continue;
      const base = file.slice(0, -4);
      if (['python', 'pythonw', 'pip', 'pip3'].includes(base.toLowerCase())) continue;
      names.add(base);
    } else {
      if (['python', 'python3', 'pip', 'pip3', 'activate'].includes(lower)) continue;
      const full = path.join(scripts, file);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        names.add(file);
      } catch {
        // skip non-executable
      }
    }
  }
  return [...names].sort();
}

export async function inspectRegisteredVenv(
  venvPath: string,
  packageHint: string,
): Promise<{ version: string | null; entry_points: string[] }> {
  try {
    const inspected = await inspectPackage(venvPath, packageHint);
    if (inspected.entry_points.length > 0) return inspected;
  } catch {
    // fall through to scripts scan
  }
  return {
    version: null,
    entry_points: listEntryPointNames(venvPath),
  };
}

export function parseBulkFolders(folders: string[]): string[] {
  return folders.map((f) => {
    const trimmed = f.trim();
    if (!trimmed) throw new ValidationError('Empty folder in bulk list');
    if (!path.isAbsolute(trimmed)) throw new ValidationError('Bulk folders must be absolute');
    if (trimmed.startsWith('-')) throw new ValidationError('Folder must not start with a hyphen');
    return path.resolve(trimmed);
  });
}
