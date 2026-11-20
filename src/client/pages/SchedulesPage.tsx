/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSession } from '../session';

type Schedule = {
  id: number;
  slug: string;
  name: string;
  entry_point: string;
  args_json: string;
  interval_minutes: number;
  next_run_at: string;
  enabled: number;
};

type AppOption = { slug: string; name: string };

export function SchedulesPage() {
  const { api } = useSession();
  const [rows, setRows] = useState<Schedule[]>([]);
  const [apps, setApps] = useState<AppOption[]>([]);
  const [slug, setSlug] = useState('');
  const [entry, setEntry] = useState('');
  const [argsText, setArgsText] = useState('');
  const [interval, setIntervalMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [schedRes, appsRes] = await Promise.all([api('/api/schedules'), api('/api/apps')]);
    if (!schedRes.ok) throw new Error('Failed to load schedules');
    if (!appsRes.ok) throw new Error('Failed to load apps');
    const schedBody = (await schedRes.json()) as { schedules: Schedule[] };
    const appsBody = (await appsRes.json()) as {
      apps: AppOption[];
      projects: AppOption[];
    };
    setRows(schedBody.schedules);
    setApps([...appsBody.apps, ...appsBody.projects]);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

  async function create() {
    setError(null);
    const res = await api('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        entryPoint: entry,
        args: argsText.split(/\s+/).filter(Boolean),
        intervalMinutes: interval,
      }),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(body.error || 'Create failed');
      return;
    }
    await load();
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Schedules
      </Typography>
      <Typography color="text.secondary">
        Interval schedules run while this server is up. Prefer presets on the app detail page for complex args.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2} maxWidth={640}>
          <TextField select label="App" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {apps.map((a) => (
              <MenuItem key={a.slug} value={a.slug}>
                {a.name} ({a.slug})
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Entry point" value={entry} onChange={(e) => setEntry(e.target.value)} />
          <TextField label="Args" value={argsText} onChange={(e) => setArgsText(e.target.value)} />
          <TextField
            type="number"
            label="Interval minutes"
            value={interval}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            inputProps={{ min: 1 }}
          />
          {error && (
            <Typography color="error" role="alert">
              {error}
            </Typography>
          )}
          <Button variant="contained" onClick={() => void create()} disabled={!slug || !entry}>
            Create schedule
          </Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {rows.length === 0 ? (
          <Typography color="text.secondary">No schedules yet.</Typography>
        ) : (
          <Table aria-label="Schedules">
            <TableHead>
              <TableRow>
                <TableCell>App</TableCell>
                <TableCell>Entry</TableCell>
                <TableCell>Interval</TableCell>
                <TableCell>Next</TableCell>
                <TableCell>Enabled</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button component={RouterLink} to={`/apps/${row.slug}`}>
                      {row.name}
                    </Button>
                  </TableCell>
                  <TableCell>{row.entry_point}</TableCell>
                  <TableCell>{row.interval_minutes} min</TableCell>
                  <TableCell>{row.next_run_at}</TableCell>
                  <TableCell>{row.enabled ? 'yes' : 'no'}</TableCell>
                  <TableCell>
                    <Button
                      onClick={() =>
                        void api(`/api/schedules/${row.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ enabled: !row.enabled }),
                        }).then(() => load())
                      }
                    >
                      {row.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      color="error"
                      onClick={() =>
                        void api(`/api/schedules/${row.id}`, { method: 'DELETE', body: '{}' }).then(
                          () => load(),
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
      </Paper>
    </Stack>
  );
}
