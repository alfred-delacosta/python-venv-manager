/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Button,
  Paper,
  Stack,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { useSession } from '../session';

type Job = {
  id: number;
  type: string;
  slug: string | null;
  status: string;
  log: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export function JobsPage() {
  const { id } = useParams();
  const { api } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const res = await api('/api/jobs');
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: Job[] };
      if (cancelled) return;
      setJobs(data.jobs);
      if (id) {
        const detail = await api(`/api/jobs/${id}`);
        if (detail.ok) {
          const body = (await detail.json()) as { job: Job };
          if (!cancelled) setSelected(body.job);
        }
      } else {
        setSelected(null);
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, id]);

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Jobs
      </Typography>
      <Typography color="text.secondary">
        Status is polled. Live streaming arrives in a later phase.
      </Typography>
      {selected && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
            <Typography variant="h5" component="h2">
              Job #{selected.id} · {selected.type} · {selected.status}
            </Typography>
            {(selected.status === 'queued' || selected.status === 'running') && (
              <Button
                color="warning"
                variant="outlined"
                onClick={() => void api(`/api/jobs/${selected.id}/cancel`, { method: 'POST', body: '{}' })}
              >
                Cancel
              </Button>
            )}
          </Stack>
          {selected.error && (
            <Typography color="error" sx={{ mt: 1 }}>
              {selected.error}
            </Typography>
          )}
          <Typography
            component="pre"
            sx={{
              mt: 2,
              p: 2,
              bgcolor: 'action.hover',
              overflow: 'auto',
              maxHeight: 420,
              fontFamily: 'Consolas, monospace',
              fontSize: 13,
            }}
          >
            {selected.log || 'No log yet.'}
          </Typography>
        </Paper>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Table aria-label="Jobs">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} hover selected={String(job.id) === id}>
                <TableCell>
                  <Button component={RouterLink} to={`/jobs/${job.id}`}>
                    #{job.id}
                  </Button>
                </TableCell>
                <TableCell>{job.type}</TableCell>
                <TableCell>{job.slug ?? '-'}</TableCell>
                <TableCell>{job.status}</TableCell>
                <TableCell>{job.created_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
