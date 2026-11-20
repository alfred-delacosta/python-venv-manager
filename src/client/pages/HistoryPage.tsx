/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Button,
  Fade,
  MenuItem,
  Paper,
  Slide,
  Stack,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { useSession } from '../session';
import { motionDuration } from '../motion';
import { renderLogAsText } from '../logText';

type RunRow = {
  id: number;
  slug: string;
  name: string;
  entry_point: string | null;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  source: string;
  log: string;
};

export function HistoryPage() {
  const { api } = useSession();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<RunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<RunRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slug = params.get('slug') ?? '';
  const source = params.get('source') ?? '';
  const result = params.get('result') ?? '';
  const offset = Number(params.get('offset') ?? '0');

  useEffect(() => {
    const q = new URLSearchParams();
    if (slug) q.set('slug', slug);
    if (source) q.set('source', source);
    if (result) q.set('result', result);
    q.set('limit', '25');
    q.set('offset', String(offset));
    void api(`/api/runs?${q}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load history');
        const data = (await res.json()) as { rows: RunRow[]; total: number };
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, slug, source, result, offset]);

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setParams(next);
  }

  return (
    <Fade in timeout={motionDuration(220)}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Run history
        </Typography>
        <Typography color="text.secondary">
          Web and CLI runs share one history. Filters apply across both sources.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
          <TextField
            label="App slug"
            value={slug}
            onChange={(e) => updateFilter('slug', e.target.value)}
          />
          <TextField
            select
            label="Source"
            value={source}
            onChange={(e) => updateFilter('source', e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="web">web</MenuItem>
            <MenuItem value="cli">cli</MenuItem>
            <MenuItem value="schedule">schedule</MenuItem>
          </TextField>
          <TextField
            select
            label="Result"
            value={result}
            onChange={(e) => updateFilter('result', e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="ok">ok</MenuItem>
            <MenuItem value="failed">failed</MenuItem>
            <MenuItem value="running">running</MenuItem>
          </TextField>
        </Stack>
        {error && (
          <Typography color="error" role="alert">
            {error}
          </Typography>
        )}
        <Paper variant="outlined" sx={{ p: 2 }}>
          {rows.length === 0 ? (
            <Typography color="text.secondary">No runs match these filters.</Typography>
          ) : (
            <Table aria-label="Run history">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>App</TableCell>
                  <TableCell>Entry</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Exit</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Open</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.started_at}</TableCell>
                    <TableCell>
                      <Button component={RouterLink} to={`/apps/${row.slug}`}>
                        {row.name}
                      </Button>
                    </TableCell>
                    <TableCell>{row.entry_point ?? '-'}</TableCell>
                    <TableCell>{row.source}</TableCell>
                    <TableCell>{row.exit_code ?? (row.ended_at ? '-' : 'running')}</TableCell>
                    <TableCell>
                      {row.duration_ms != null ? `${row.duration_ms} ms` : '-'}
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => setDetail(row)}>Log</Button>
                      {!row.ended_at && (
                        <Button component={RouterLink} to={`/live/run/${row.id}`}>
                          Live
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Stack direction="row" gap={1} sx={{ mt: 2 }}>
            <Button
              disabled={offset <= 0}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('offset', String(Math.max(0, offset - 25)));
                setParams(next);
              }}
            >
              Previous
            </Button>
            <Typography sx={{ alignSelf: 'center' }}>
              {Math.min(offset + 1, total)}-{Math.min(offset + rows.length, total)} of {total}
            </Typography>
            <Button
              disabled={offset + rows.length >= total}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('offset', String(offset + 25));
                setParams(next);
              }}
            >
              Next
            </Button>
          </Stack>
        </Paper>
        <Slide direction="up" in={Boolean(detail)} mountOnEnter unmountOnExit timeout={motionDuration(250)}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="h5" component="h2">
                Run #{detail?.id} log
              </Typography>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </Stack>
            <BoxPre text={detail?.log ?? ''} />
          </Paper>
        </Slide>
      </Stack>
    </Fade>
  );
}

function BoxPre({ text }: { text: string }) {
  return (
    <Typography
      component="pre"
      sx={{
        mt: 2,
        p: 2,
        maxHeight: 360,
        overflow: 'auto',
        bgcolor: 'action.hover',
        fontFamily: 'Consolas, monospace',
        fontSize: 13,
        whiteSpace: 'pre-wrap',
      }}
    >
      {renderLogAsText(text) || 'No log stored.'}
    </Typography>
  );
}
