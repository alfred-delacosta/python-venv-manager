/* Copyright Advanced Software and AI Solutions LLC */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { activateCommand, allActivateCommands, pythonPathCommand } from './activate.js';

describe('activate commands', () => {
  it('returns quoted commands for all four shells', () => {
    const venv = path.join(path.sep, 'apps', 'demo', '.venv');
    const all = allActivateCommands(venv);
    expect(all.powershell.activate).toContain('Activate.ps1');
    expect(all.cmd.activate.toLowerCase()).toContain('activate.bat');
    expect(all.bash.activate.startsWith('source ')).toBe(true);
    expect(all.zsh.activate.startsWith('source ')).toBe(true);
    expect(pythonPathCommand(venv, 'bash')).toContain('python');
    expect(activateCommand(venv, 'powershell')).toMatch(/^\. '/);
  });
});
