/* Copyright Advanced Software and AI Solutions LLC */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPyappsHome, loadConfig } from './config.js';

describe('config', () => {
  it('defaults home from mocked os.homedir', () => {
    const home = defaultPyappsHome(() => path.join('C:', 'Users', 'Example'));
    expect(home).toBe(path.join('C:', 'Users', 'Example', 'pyapps'));
  });

  it('requires SESSION_SECRET for server config', () => {
    expect(() =>
      loadConfig({ SESSION_SECRET: 'short' } as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_SECRET/);
  });

  it('reads PORT from env', () => {
    const cfg = loadConfig({
      SESSION_SECRET: 'x'.repeat(32),
      PORT: '4000',
    } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(4000);
    expect(cfg.host).toBe('127.0.0.1');
  });
});
