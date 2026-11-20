/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Button,
  Chip,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { useSession } from '../session';

type AppRow = {
  id: number;
  slug: string;
  name: string;
  kind: string;
  version: string | null;
  source_type: string;
  source_value: string;
  update_available?: number;
  remote_version?: string | null;
};

export function DashboardPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [projects, setProjects] = useState<AppRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api('/api/apps');
    if (!res.ok) throw new Error('Failed to load catalog');
    const data = (await res.json()) as { apps: AppRow[]; projects: AppRow[] };
    setApps(data.apps);
    setProjects(data.projects);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

  async function checkUpdates() {
    setBusy(true);
    setError(null);
    try {
      const res = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ type: 'check-updates' }),
      });
      const body = (await res.json()) as { job?: { id: number }; error?: string };
      if (!res.ok) throw new Error(body.error || 'Failed to start check');
      navigate(`/jobs/${body.job!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const updates = apps.filter((a) => a.update_available).length;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
        <div>
          <Typography variant="h4" component="h1">
            Apps and Projects
          </Typography>
          <Typography color="text.secondary">
            Each app gets its own venv. Projects keep theirs in the project folder.
          </Typography>
          {updates > 0 && (
            <Typography sx={{ mt: 1 }} color="warning.main">
              {updates} app{updates === 1 ? '' : 's'} may have updates available.
            </Typography>
          )}
        </div>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="outlined" onClick={() => void checkUpdates()} disabled={busy}>
            Check for updates
          </Button>
          <Button component={RouterLink} to="/import" variant="outlined">
            Bulk import
          </Button>
          <Button component={RouterLink} to="/add" variant="contained">
            Add app or project
          </Button>
        </Stack>
      </Stack>
      {error && (
        <Typography color="error" role="alert">
          {error}
        </Typography>
      )}
      <Section title="Apps" rows={apps} empty="No apps yet." />
      <Section title="Projects" rows={projects} empty="No projects yet." />
    </Stack>
  );
}

function Section({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: AppRow[];
  empty: string;
}) {
  return (
    <Paper sx={{ p: 2 }} elevation={0} variant="outlined">
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      {rows.length === 0 ? (
        <Typography color="text.secondary">{empty}</Typography>
      ) : (
        <Table size="medium" aria-label={title}>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Version</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Updates</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>
                  <Button component={RouterLink} to={`/apps/${row.slug}`} sx={{ justifyContent: 'flex-start' }}>
                    {row.name}
                  </Button>
                </TableCell>
                <TableCell>{row.slug}</TableCell>
                <TableCell>{row.version ?? '-'}</TableCell>
                <TableCell>
                  {row.source_type}: {row.source_value}
                </TableCell>
                <TableCell>
                  {row.update_available ? (
                    <Chip
                      color="warning"
                      label={row.remote_version ? `Update ${row.remote_version}` : 'Update available'}
                      size="small"
                    />
                  ) : (
                    '-'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
