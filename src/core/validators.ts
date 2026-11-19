/* Copyright Advanced Software and AI Solutions LLC */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MAX_RUN_ARG_BYTES, MAX_RUN_ARGS } from './config.js';

const PEP440 =
  /^((([1-9][0-9]*!)?(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*((a|b|rc)(0|[1-9][0-9]*))?(\.post(0|[1-9][0-9]*))?(\.dev(0|[1-9][0-9]*))?)|(\*))$/i;

const PYPI_NAME = /^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9])$/;
const EXTRA = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
const GITHUB_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function rejectLeadingHyphen(value: string, label: string): void {
  if (value.startsWith('-')) {
    throw new ValidationError(`${label} must not start with a hyphen`);
  }
}

export function parsePypiRequirement(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new ValidationError('PyPI requirement is required');
  rejectLeadingHyphen(trimmed, 'PyPI requirement');

  let name = trimmed;
  let extras = '';
  let spec = '';

  const extrasMatch = trimmed.match(/^([^[\s]+)\[([^\]]+)\](.*)$/);
  if (extrasMatch) {
    name = extrasMatch[1];
    extras = extrasMatch[2];
    spec = extrasMatch[3].trim();
  } else {
    const specMatch = trimmed.match(/^([^\s<=>!~]+)(.*)$/);
    if (!specMatch) throw new ValidationError('Invalid PyPI requirement');
    name = specMatch[1];
    spec = specMatch[2].trim();
  }

  if (!PYPI_NAME.test(name)) {
    throw new ValidationError('Invalid PyPI package name');
  }
  if (extras) {
    for (const extra of extras.split(',').map((e) => e.trim()).filter(Boolean)) {
      if (!EXTRA.test(extra)) throw new ValidationError(`Invalid extra: ${extra}`);
    }
  }
  if (spec) {
    const ops = spec.match(/^(===|==|!=|<=|>=|~=|<|>)(.+)$/);
    if (!ops) throw new ValidationError('Invalid version specifier');
    const version = ops[2].trim();
    if (!PEP440.test(version) && version !== '*') {
      throw new ValidationError('Invalid PEP 440 version');
    }
  }

  return trimmed;
}

export function parseGithubSource(url: string, ref?: string): { gitUrl: string; display: string } {
  const trimmed = url.trim();
  rejectLeadingHyphen(trimmed, 'GitHub URL');
  const match = trimmed.match(GITHUB_URL);
  if (!match) {
    throw new ValidationError('Only https://github.com/owner/repo URLs are allowed');
  }
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  let gitUrl = `git+https://github.com/${owner}/${repo}.git`;
  if (ref !== undefined && ref !== '') {
    const safeRef = ref.trim();
    rejectLeadingHyphen(safeRef, 'Git ref');
    if (!SAFE_REF.test(safeRef) || safeRef.includes('..')) {
      throw new ValidationError('Unsafe git ref');
    }
    gitUrl += `@${safeRef}`;
  }
  return { gitUrl, display: `https://github.com/${owner}/${repo}` };
}

export function parseLocalFolder(folder: string): string {
  const trimmed = folder.trim();
  if (!trimmed) throw new ValidationError('Local folder is required');
  rejectLeadingHyphen(trimmed, 'Local folder');
  if (!path.isAbsolute(trimmed)) {
    throw new ValidationError('Local folder must be an absolute path');
  }
  if (!fs.existsSync(trimmed)) {
    throw new ValidationError('Local folder does not exist');
  }
  const real = fs.realpathSync(trimmed);
  const hasProject =
    fs.existsSync(path.join(real, 'pyproject.toml')) ||
    fs.existsSync(path.join(real, 'setup.py'));
  if (!hasProject) {
    throw new ValidationError('Local folder needs pyproject.toml or setup.py');
  }
  return real;
}

export function parseSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (!SLUG.test(trimmed)) {
    throw new ValidationError('Slug must be lowercase letters, numbers, and hyphens');
  }
  rejectLeadingHyphen(trimmed, 'Slug');
  return trimmed;
}

export function parseRunArgs(args: string[]): string[] {
  if (args.length > MAX_RUN_ARGS) {
    throw new ValidationError(`At most ${MAX_RUN_ARGS} run arguments are allowed`);
  }
  // Leading hyphens are allowed here so flags like --help can be forwarded as argv
  // elements with shell:false. Slugs, paths, refs, and package names still reject them.
  return args.map((arg, index) => {
    if (typeof arg !== 'string') throw new ValidationError('Run arguments must be strings');
    if (arg.includes('\0')) throw new ValidationError('Run arguments must not contain NUL');
    if (Buffer.byteLength(arg, 'utf8') > MAX_RUN_ARG_BYTES) {
      throw new ValidationError(`Run argument ${index + 1} exceeds ${MAX_RUN_ARG_BYTES} bytes`);
    }
    return arg;
  });
}

export const installSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pypi'),
    requirement: z.string().min(1),
  }),
  z.object({
    type: z.literal('github'),
    url: z.string().min(1),
    ref: z.string().optional(),
  }),
  z.object({
    type: z.literal('local'),
    folder: z.string().min(1),
    editable: z.boolean().optional(),
  }),
]);

export type InstallSource = z.infer<typeof installSourceSchema>;

export function normalizeInstallSource(input: InstallSource): {
  type: InstallSource['type'];
  value: string;
  installArg: string;
  editable: boolean;
} {
  if (input.type === 'pypi') {
    const requirement = parsePypiRequirement(input.requirement);
    return { type: 'pypi', value: requirement, installArg: requirement, editable: false };
  }
  if (input.type === 'github') {
    const parsed = parseGithubSource(input.url, input.ref);
    return { type: 'github', value: parsed.display, installArg: parsed.gitUrl, editable: false };
  }
  const folder = parseLocalFolder(input.folder);
  return {
    type: 'local',
    value: folder,
    installArg: folder,
    editable: Boolean(input.editable),
  };
}

export function assertNoJoinedSpawn(args: string[]): void {
  for (const arg of args) {
    if (/\s|;|&|\||`|\$\(|<|>/.test(arg) && arg.includes(' ')) {
      // Individual args may contain spaces as a single argv element; joining is forbidden at call sites.
    }
  }
}
