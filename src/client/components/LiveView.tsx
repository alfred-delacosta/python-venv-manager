/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  Typography,
  Fade,
} from '@mui/material';
import { useSession } from '../session';
import { motionDuration, prefersReducedMotion } from '../motion';
import { renderLogAsText } from '../logText';

type LiveViewProps = {
  kind: 'job' | 'run';
  id: number;
  title: string;
  onFinished?: (payload: string) => void;
};

export function LiveView({ kind, id, title, onFinished }: LiveViewProps) {
  const { api } = useSession();
  const [lines, setLines] = useState('');
  const [status, setStatus] = useState('connecting');
  const [paused, setPaused] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exitInfo, setExitInfo] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const lastStatusAt = useRef(0);

  useEffect(() => {
    const url = kind === 'job' ? `/api/jobs/${id}/events` : `/api/runs/${id}/events`;
    const es = new EventSource(url, { withCredentials: true });
    let buffer = '';

    const append = (chunk: string) => {
      buffer += chunk;
      setLines(buffer);
    };

    es.addEventListener('line', (ev) => {
      append((ev as MessageEvent).data + '\n');
    });
    es.addEventListener('status', (ev) => {
      const next = (ev as MessageEvent).data;
      setStatus(next);
      const now = Date.now();
      if (now - lastStatusAt.current > 1000 && statusRef.current) {
        statusRef.current.textContent = `Status: ${next}`;
        lastStatusAt.current = now;
      }
    });
    es.addEventListener('end', (ev) => {
      const payload = (ev as MessageEvent).data;
      setStatus('finished');
      setExitInfo(payload);
      onFinished?.(payload);
      es.close();
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      setStatus('reconnecting');
    };

    return () => es.close();
  }, [kind, id, onFinished]);

  useEffect(() => {
    if (paused || !preRef.current) return;
    if (prefersReducedMotion()) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    } else {
      preRef.current.scrollTo({ top: preRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [lines, paused]);

  async function cancel() {
    const path = kind === 'job' ? `/api/jobs/${id}/cancel` : `/api/runs/${id}/cancel`;
    await api(path, { method: 'POST', body: '{}' });
    setConfirmCancel(false);
  }

  const busy = status === 'running' || status === 'connecting' || status === 'reconnecting' || status === 'queued';

  return (
    <Fade in timeout={motionDuration(200)}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
          <div>
            <Typography variant="h5" component="h2">
              {title}
            </Typography>
            <Typography
              ref={statusRef}
              variant="body2"
              color="text.secondary"
              aria-live="polite"
              aria-atomic="true"
            >
              Status: {status}
            </Typography>
            {exitInfo && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Finished: {exitInfo}
              </Typography>
            )}
          </div>
          <Stack direction="row" gap={1} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={paused}
                  onChange={(e) => setPaused(e.target.checked)}
                  inputProps={{ 'aria-label': 'Pause auto scroll' }}
                />
              }
              label="Pause scroll"
            />
            <Button
              color="warning"
              variant="outlined"
              disabled={!busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
        {busy && !prefersReducedMotion() && (
          <LinearProgress aria-label="Job progress" sx={{ height: 6, borderRadius: 1 }} />
        )}
        <Box
          component="pre"
          ref={preRef}
          tabIndex={0}
          aria-label="Live output"
          sx={{
            m: 0,
            p: 2,
            maxHeight: 420,
            overflow: 'auto',
            bgcolor: 'action.hover',
            fontFamily: 'Consolas, ui-monospace, monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {renderLogAsText(lines) || 'Waiting for output...'}
        </Box>
        <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)}>
          <DialogTitle>Cancel this {kind}?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This kills the process tree. Output so far stays in history.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmCancel(false)}>Keep running</Button>
            <Button color="warning" variant="contained" onClick={() => void cancel()}>
              Cancel now
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Fade>
  );
}
