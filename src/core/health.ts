/* Copyright Advanced Software and AI Solutions LLC */
import { runCapture } from './spawn.js';

export type HealthReport = {
  uv: { ok: boolean; version?: string; error?: string };
  git: { ok: boolean; version?: string; error?: string };
  pythons: { ok: boolean; installed: string[]; error?: string };
  uvInstallCommands: {
    windows: string;
    macosLinux: string;
    docsUrl: string;
  };
};

export const UV_INSTALL_DOCS = 'https://docs.astral.sh/uv/getting-started/installation';

export async function collectHealth(): Promise<HealthReport> {
  const uvInstallCommands = {
    windows: 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
    macosLinux: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
    docsUrl: UV_INSTALL_DOCS,
  };

  const report: HealthReport = {
    uv: { ok: false },
    git: { ok: false },
    pythons: { ok: false, installed: [] },
    uvInstallCommands,
  };

  try {
    const uv = await runCapture('uv', ['--version']);
    if (uv.code === 0) {
      report.uv = { ok: true, version: uv.stdout.trim() || uv.stderr.trim() };
    } else {
      report.uv = { ok: false, error: uv.stderr.trim() || 'uv returned non-zero' };
    }
  } catch (err) {
    report.uv = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const git = await runCapture('git', ['--version']);
    if (git.code === 0) {
      report.git = { ok: true, version: git.stdout.trim() };
    } else {
      report.git = { ok: false, error: git.stderr.trim() || 'git returned non-zero' };
    }
  } catch (err) {
    report.git = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (report.uv.ok) {
    try {
      const list = await runCapture('uv', ['python', 'list', '--only-installed']);
      if (list.code === 0) {
        report.pythons = {
          ok: true,
          installed: list.stdout
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean),
        };
      } else {
        report.pythons = { ok: false, installed: [], error: list.stderr.trim() };
      }
    } catch (err) {
      report.pythons = {
        ok: false,
        installed: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    report.pythons = {
      ok: false,
      installed: [],
      error: 'uv is missing; install uv before listing Python interpreters',
    };
  }

  return report;
}
