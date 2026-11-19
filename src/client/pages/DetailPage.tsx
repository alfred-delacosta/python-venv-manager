/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Fade,
  Stack,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  IconButton,
  Tooltip,
  MenuItem,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSession } from '../session';
import { motionDuration } from '../motion';

type Preset = {
  id: number;
  name: string;
  entry_point: string;
  args_json: string;
};

type Detail = {
  app: {
    slug: string;
    name: string;
    kind: string;
    version: string | null;
    venv_path: string;
    entry_points_json: string;
    source_type: string;
    source_value: string;
  };
  runs: Array<{
    id: number;
    entry_point: string | null;
    started_at: string;
    exit_code: number | null;
    duration_ms: number | null;
    source: string;
  }>;
  activate: Record<string, { activate: string; python: string }>;
};

export function DetailPage() {
  const { slug } = useParams();
  const { api } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [argsText, setArgsText] = useState('');
  const [cwd, setCwd] = useState('');
  const [presetId, setPresetId] = useState<number | ''>('');
  const [presetName, setPresetName] = useState('');
  const [renameId, setRenameId] = useState<number | ''>('');
  const [renameValue, setRenameValue] = useState('');

  async function reload() {
    if (!slug) return;
    const res = await api(`/api/apps/${slug}`);
    if (!res.ok) throw new Error('Not found');
    const body = (await res.json()) as Detail;
    setData(body);
    const points = JSON.parse(body.app.entry_points_json) as string[];
    setEntry((prev) => prev || points[0] || body.app.slug);
    const presetRes = await api(`/api/apps/${slug}/presets`);
    if (presetRes.ok) {
      const presetBody = (await presetRes.json()) as { presets: Preset[] };
      setPresets(presetBody.presets);
    }
  }

  useEffect(() => {
    void reload().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, slug]);

  async function enqueue(type: string, extra: Record<string, unknown> = {}) {
    const res = await api('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type, slug, ...extra }),
    });
    const body = (await res.json()) as { job?: { id: number }; error?: string };
    if (!res.ok) {
      setError(body.error || 'Job failed to start');
      return;
    }
    navigate(`/jobs/${body.job!.id}`);
  }

  async function startRun() {
    setError(null);
    const args = argsText
      .split(/\s+/)
      .map((a) => a.trim())
      .filter(Boolean);
    const res = await api('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        entryPoint: presetId === '' ? entry : undefined,
        args: presetId === '' ? args : undefined,
        presetId: presetId === '' ? undefined : presetId,
        cwd: cwd || undefined,
      }),
    });
    const body = (await res.json()) as { run?: { id: number }; error?: string };
    if (!res.ok) {
      setError(body.error || 'Failed to start run');
      return;
    }
    navigate(`/live/run/${body.run!.id}`);
  }

  async function savePreset() {
    setError(null);
    const args = argsText
      .split(/\s+/)
      .map((a) => a.trim())
      .filter(Boolean);
    const res = await api(`/api/apps/${slug}/presets`, {
      method: 'POST',
      body: JSON.stringify({ name: presetName, entryPoint: entry, args }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(body.error || 'Failed to save preset');
      return;
    }
    setPresetName('');
    await reload();
  }

  if (error && !data) {
    return (
      <Typography color="error" role="alert">
        {error}
      </Typography>
    );
  }
  if (!data) return <Typography>Loading</Typography>;

  const entryPoints = JSON.parse(data.app.entry_points_json) as string[];

  return (
    <Fade in timeout={motionDuration(220)}>
      <Stack spacing={3}>
        {error && (
          <Typography color="error" role="alert">
            {error}
          </Typography>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <div>
            <Typography variant="h4" component="h1">
              {data.app.name}
            </Typography>
            <Typography color="text.secondary">
              {data.app.kind} · {data.app.slug} · {data.app.version ?? 'no version'} · {data.app.source_type}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Venv: {data.app.venv_path}
            </Typography>
          </div>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="outlined" onClick={() => void enqueue('update')}>
              Update
            </Button>
            <Button variant="outlined" onClick={() => void enqueue('repair')}>
              Repair
            </Button>
            <Button component={RouterLink} to={`/history?slug=${data.app.slug}`} variant="text">
              History
            </Button>
          </Stack>
        </Stack>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Run
          </Typography>
          <Stack spacing={2} maxWidth={640}>
            <TextField
              select
              label="Preset"
              value={presetId}
              onChange={(e) => {
                const value = e.target.value;
                setPresetId(value === '' ? '' : Number(value));
                if (value !== '') {
                  const preset = presets.find((p) => p.id === Number(value));
                  if (preset) {
                    setEntry(preset.entry_point);
                    setArgsText((JSON.parse(preset.args_json) as string[]).join(' '));
                  }
                }
              }}
            >
              <MenuItem value="">Custom arguments</MenuItem>
              {presets.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Entry point"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              disabled={presetId !== ''}
            >
              {entryPoints.map((ep) => (
                <MenuItem key={ep} value={ep}>
                  {ep}
                </MenuItem>
              ))}
              {!entryPoints.includes(entry) && entry && (
                <MenuItem value={entry}>{entry}</MenuItem>
              )}
            </TextField>
            <TextField
              label="Arguments"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              helperText="Space-separated. Flags like --help are allowed."
              disabled={presetId !== ''}
            />
            <TextField
              label="Working folder (optional, absolute)"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            />
            <Button variant="contained" onClick={() => void startRun()}>
              Start run
            </Button>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Presets
          </Typography>
          <Stack spacing={2} maxWidth={640}>
            <TextField
              label="New preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button variant="outlined" onClick={() => void savePreset()} disabled={!presetName || !entry}>
              Save current arguments as preset
            </Button>
            {presets.length === 0 ? (
              <Typography color="text.secondary">No presets yet.</Typography>
            ) : (
              <Table aria-label="Presets">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Entry</TableCell>
                    <TableCell>Args</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {presets.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.entry_point}</TableCell>
                      <TableCell>{(JSON.parse(p.args_json) as string[]).join(' ')}</TableCell>
                      <TableCell>
                        <Button
                          onClick={() => {
                            setPresetId(p.id);
                            setEntry(p.entry_point);
                            setArgsText((JSON.parse(p.args_json) as string[]).join(' '));
                          }}
                        >
                          Use
                        </Button>
                        <Button
                          onClick={() => {
                            setRenameId(p.id);
                            setRenameValue(p.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          color="error"
                          onClick={() =>
                            void api(`/api/presets/${p.id}`, { method: 'DELETE', body: '{}' }).then(
                              () => reload(),
                            )
                          }
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {renameId !== '' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                <TextField
                  label="Rename preset"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={() =>
                    void api(`/api/presets/${renameId}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ name: renameValue }),
                    }).then(async (res) => {
                      if (!res.ok) {
                        const body = (await res.json()) as { error?: string };
                        setError(body.error || 'Rename failed');
                        return;
                      }
                      setRenameId('');
                      await reload();
                    })
                  }
                >
                  Save name
                </Button>
              </Stack>
            )}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Entry points
          </Typography>
          {entryPoints.length === 0 ? (
            <Typography color="text.secondary">None detected.</Typography>
          ) : (
            <Stack component="ul" sx={{ pl: 2, m: 0 }}>
              {entryPoints.map((ep) => (
                <Typography component="li" key={ep}>
                  {ep}
                </Typography>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Activate commands
          </Typography>
          <Stack spacing={1}>
            {Object.entries(data.activate).map(([shell, cmds]) => (
              <Stack key={shell} spacing={0.5}>
                <Typography fontWeight={600}>{shell}</Typography>
                <CopyRow label="activate" value={cmds.activate} />
                <CopyRow label="python" value={cmds.python} />
              </Stack>
            ))}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Recent runs
          </Typography>
          {data.runs.length === 0 ? (
            <Typography color="text.secondary">No runs yet.</Typography>
          ) : (
            <Table aria-label="Recent runs">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Entry</TableCell>
                  <TableCell>Exit</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Source</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.started_at}</TableCell>
                    <TableCell>{run.entry_point ?? '-'}</TableCell>
                    <TableCell>{run.exit_code ?? '-'}</TableCell>
                    <TableCell>{run.duration_ms != null ? `${run.duration_ms} ms` : '-'}</TableCell>
                    <TableCell>{run.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Remove
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {data.app.kind === 'project'
              ? 'Removing a project only unregisters it. The folder and .venv stay.'
              : 'Type the slug to confirm. This deletes only the app folder under the home directory.'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField
              label="Confirm slug"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button
              color="error"
              variant="contained"
              disabled={confirm !== data.app.slug}
              onClick={() => void enqueue('remove', { confirmSlug: confirm })}
            >
              Remove
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Fade>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Typography variant="body2" sx={{ minWidth: 72 }}>
        {label}
      </Typography>
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
        <IconButton
          aria-label={`Copy ${label}`}
          onClick={() => void navigator.clipboard.writeText(value)}
        >
          <ContentCopyIcon />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
