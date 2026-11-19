/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Fade,
  Grow,
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
import { LiveView } from '../components/LiveView';
import { motionDuration } from '../motion';

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
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, id]);

  return (
    <Fade in timeout={motionDuration(220)}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Jobs
        </Typography>
        <Typography color="text.secondary">
          Install and update jobs stream live. Open a job to watch output.
        </Typography>
        {selected && (
          <Grow in timeout={motionDuration(250)}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <LiveView
                kind="job"
                id={selected.id}
                title={`Job #${selected.id} · ${selected.type}`}
                onFinished={() => {
                  void api(`/api/jobs/${selected.id}`).then(async (res) => {
                    if (!res.ok) return;
                    const body = (await res.json()) as { job: Job };
                    setSelected(body.job);
                  });
                }}
              />
              {selected.error && (
                <Typography color="error" sx={{ mt: 1 }}>
                  {selected.error}
                </Typography>
              )}
            </Paper>
          </Grow>
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
                <TableRow
                  key={job.id}
                  hover
                  selected={String(job.id) === id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
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
    </Fade>
  );
}
