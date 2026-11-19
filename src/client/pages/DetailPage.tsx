/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
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
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSession } from '../session';

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
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    void api(`/api/apps/${slug}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Not found');
        setData((await res.json()) as Detail);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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

  if (error) {
    return (
      <Typography color="error" role="alert">
        {error}
      </Typography>
    );
  }
  if (!data) return <Typography>Loading</Typography>;

  const entryPoints = JSON.parse(data.app.entry_points_json) as string[];

  return (
    <Stack spacing={3}>
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
          <Button component={RouterLink} to="/jobs" variant="text">
            Jobs
          </Button>
        </Stack>
      </Stack>

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
