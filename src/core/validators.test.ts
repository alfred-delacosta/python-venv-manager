/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import {
  parseGithubSource,
  parsePypiRequirement,
  parseRunArgs,
  parseSlug,
  ValidationError,
} from './validators.js';

describe('validators', () => {
  it('accepts normal PyPI names and extras', () => {
    expect(parsePypiRequirement('crwl')).toBe('crwl');
    expect(parsePypiRequirement('Some_Package[extra]==1.2.3')).toContain('Some_Package');
  });

  it('rejects hostile PyPI input', () => {
    expect(() => parsePypiRequirement('-e evil')).toThrow(ValidationError);
    expect(() => parsePypiRequirement('pkg; rm -rf /')).toThrow(ValidationError);
    expect(() => parsePypiRequirement('pkg`id`')).toThrow(ValidationError);
  });

  it('allows only github.com https URLs', () => {
    const ok = parseGithubSource('https://github.com/owner/repo', 'main');
    expect(ok.gitUrl).toBe('git+https://github.com/owner/repo.git@main');
    expect(() => parseGithubSource('https://evil.com/owner/repo')).toThrow(ValidationError);
    expect(() => parseGithubSource('https://github.com/owner/repo', '../x')).toThrow(ValidationError);
    expect(() => parseGithubSource('https://github.com/owner/repo', '-rf')).toThrow(ValidationError);
  });

  it('validates slugs', () => {
    expect(parseSlug('my-app')).toBe('my-app');
    expect(() => parseSlug('-bad')).toThrow(ValidationError);
    expect(() => parseSlug('Bad_Slug')).toThrow(ValidationError);
  });

  it('validates run args without joining', () => {
    const args = parseRunArgs(['--help', 'file name.txt']);
    expect(args).toEqual(['--help', 'file name.txt']);
    expect(args.join(' ')).not.toBe(args[0]);
    expect(() => parseRunArgs(['ok\0bad'])).toThrow(ValidationError);
  });
});
