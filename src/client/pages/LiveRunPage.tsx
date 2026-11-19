/* Copyright Advanced Software and AI Solutions LLC */
import { useParams } from 'react-router-dom';
import { Paper, Stack, Typography } from '@mui/material';
import { LiveView } from '../components/LiveView';

export function LiveRunPage() {
  const { id } = useParams();
  const runId = Number(id);
  if (!Number.isFinite(runId)) {
    return <Typography color="error">Invalid run id</Typography>;
  }
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Live run
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <LiveView kind="run" id={runId} title={`Run #${runId}`} />
      </Paper>
    </Stack>
  );
}
