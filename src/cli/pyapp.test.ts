/* Copyright Advanced Software and AI Solutions LLC */
import { describe, expect, it } from 'vitest';
import { parseCliArgv } from './pyapp.js';

describe('cli parsing', () => {
  it('parses list and run with passthrough args', () => {
    expect(parseCliArgv(['node', 'pyapp', 'list']).command).toBe('list');
    const run = parseCliArgv(['node', 'pyapp', 'run', 'crwl', '--', '--help']);
    expect(run.command).toBe('run');
    expect(run.positional).toEqual(['crwl']);
    expect(run.passthrough).toEqual(['--help']);
  });

  it('parses activate --shell without joining', () => {
    const parsed = parseCliArgv([
      'node',
      'pyapp',
      'activate',
      'demo',
      '--shell',
      'powershell',
    ]);
    expect(parsed.shell).toBe('powershell');
    expect(parsed.positional).toEqual(['demo']);
  });
});
