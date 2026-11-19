/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import {
  Button,
  Paper,
  Stack,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSession } from '../session';

type Health = {
  uv: { ok: boolean; version?: string; error?: string };
  git: { ok: boolean; version?: string; error?: string };
  pythons: { ok: boolean; installed: string[]; error?: string };
  uvInstallCommands: { windows: string; macosLinux: string; docsUrl: string };
};

export function HealthPage() {
  const { api } = useSession();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);

  async function load() {
    const res = await api('/api/health');
    if (!res.ok) throw new Error('Failed to load health');
    setHealth((await res.json()) as Health);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

  async function installPython() {
    setJobMessage(null);
    const version = window.prompt('Python version for uv python install (example: 3.12)');
    if (!version) return;
    if (version.startsWith('-')) {
      setError('Python selector must not start with a hyphen');
      return;
    }
    const res = await api('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type: 'uv-python-install', python: version }),
    });
    const data = (await res.json()) as { job?: { id: number }; error?: string };
    if (!res.ok) {
      setError(data.error || 'Failed to start job');
      return;
    }
    setJobMessage(`Started uv python install job #${data.job!.id}`);
  }

  if (error) {
    return (
      <Typography color="error" role="alert">
        {error}
      </Typography>
    );
  }
  if (!health) return <Typography>Loading health</Typography>;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <div>
          <Typography variant="h4" component="h1">
            Health
          </Typography>
          <Typography color="text.secondary">
            Checks for uv, git, and installed Python interpreters.
          </Typography>
        </div>
        <Button variant="outlined" onClick={() => void load()}>
          Refresh
        </Button>
      </Stack>

      <StatusCard title="uv" ok={health.uv.ok} detail={health.uv.version || health.uv.error || ''} />
      <StatusCard title="git" ok={health.git.ok} detail={health.git.version || health.git.error || ''} />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Installed Pythons
        </Typography>
        {!health.uv.ok ? (
          <Typography color="text.secondary">
            uv is missing, so Python listing is unavailable.
          </Typography>
        ) : health.pythons.installed.length === 0 ? (
          <Typography color="text.secondary">
            {health.pythons.error || 'No installed interpreters reported.'}
          </Typography>
        ) : (
          <Stack component="ul" sx={{ pl: 2, m: 0 }}>
            {health.pythons.installed.map((line) => (
              <Typography component="li" key={line}>
                {line}
              </Typography>
            ))}
          </Stack>
        )}
        <Button sx={{ mt: 2 }} variant="contained" onClick={() => void installPython()} disabled={!health.uv.ok}>
          Install Python with uv
        </Button>
        {jobMessage && <Typography sx={{ mt: 1 }}>{jobMessage}</Typography>}
      </Paper>

      {!health.uv.ok && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Install uv
          </Typography>
          <Typography sx={{ mb: 2 }}>
            This app never runs an installer for you. Copy a command, then see the{' '}
            <a href={health.uvInstallCommands.docsUrl} target="_blank" rel="noreferrer">
              official uv install docs
            </a>
            .
          </Typography>
          <CopyBlock label="Windows" value={health.uvInstallCommands.windows} />
          <CopyBlock label="macOS / Linux" value={health.uvInstallCommands.macosLinux} />
        </Paper>
      )}
    </Stack>
  );
}

function StatusCard({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h5" component="h2">
        {title}: {ok ? 'ok' : 'missing'}
      </Typography>
      <Typography color="text.secondary">{detail}</Typography>
    </Paper>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
      <Typography sx={{ minWidth: 120 }}>{label}</Typography>
      <Typography
        component="code"
        sx={{
          flex: 1,
          p: 1,
          bgcolor: 'action.hover',
          borderRadius: 1,
          fontFamily: 'Consolas, monospace',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </Typography>
      <Tooltip title="Copy">
        <IconButton aria-label={`Copy ${label} command`} onClick={() => void navigator.clipboard.writeText(value)}>
          <ContentCopyIcon />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
