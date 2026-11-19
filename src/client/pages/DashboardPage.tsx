/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Button,
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
};

export function DashboardPage() {
  const { api } = useSession();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [projects, setProjects] = useState<AppRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api('/api/apps')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load catalog');
        const data = (await res.json()) as { apps: AppRow[]; projects: AppRow[] };
        setApps(data.apps);
        setProjects(data.projects);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

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
        </div>
        <Button component={RouterLink} to="/add" variant="contained">
          Add app or project
        </Button>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
