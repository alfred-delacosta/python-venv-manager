/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Fade,
  Paper,
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

type AuditRow = {
  id: number;
  who: string;
  action: string;
  result: string;
  details: string | null;
  ip: string | null;
  created_at: string;
};

export function AuditPage() {
  const { api } = useSession();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [ip, setIp] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (action) q.set('action', action);
    if (result) q.set('result', result);
    if (ip) q.set('ip', ip);
    q.set('limit', '25');
    q.set('offset', String(offset));
    void api(`/api/audit?${q}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load audit log');
        const data = (await res.json()) as { rows: AuditRow[]; total: number };
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, action, result, ip, offset]);

  return (
    <Fade in timeout={motionDuration(220)}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Audit log
        </Typography>
        <Typography color="text.secondary">
          Read only. Every login, job, run, and setting change is listed here.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
          <TextField label="Action contains" value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} />
          <TextField label="Result" value={result} onChange={(e) => { setResult(e.target.value); setOffset(0); }} />
          <TextField label="IP" value={ip} onChange={(e) => { setIp(e.target.value); setOffset(0); }} />
        </Stack>
        {error && (
          <Typography color="error" role="alert">
            {error}
          </Typography>
        )}
        <Paper variant="outlined" sx={{ p: 2 }}>
          {rows.length === 0 ? (
            <Typography color="text.secondary">No audit rows match.</Typography>
          ) : (
            <Table aria-label="Audit log">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.created_at}</TableCell>
                    <TableCell>{row.who}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.result}</TableCell>
                    <TableCell>{row.ip ?? '-'}</TableCell>
                    <TableCell>
                      <Button onClick={() => setSelected(row)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Stack direction="row" gap={1} sx={{ mt: 2 }}>
            <Button disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - 25))}>
              Previous
            </Button>
            <Typography sx={{ alignSelf: 'center' }}>
              {Math.min(offset + 1, total)}-{Math.min(offset + rows.length, total)} of {total}
            </Typography>
            <Button
              disabled={offset + rows.length >= total}
              onClick={() => setOffset(offset + 25)}
            >
              Next
            </Button>
          </Stack>
        </Paper>
        <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)}>
          <Stack sx={{ width: { xs: '100vw', sm: 420 }, p: 2 }} spacing={2}>
            <Typography variant="h5" component="h2">
              Audit #{selected?.id}
            </Typography>
            <Typography>Who: {selected?.who}</Typography>
            <Typography>Action: {selected?.action}</Typography>
            <Typography>Result: {selected?.result}</Typography>
            <Typography>IP: {selected?.ip ?? '-'}</Typography>
            <Typography>When: {selected?.created_at}</Typography>
            <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'Consolas, monospace' }}>
              {selected?.details || 'No details'}
            </Typography>
            <Button onClick={() => setSelected(null)}>Close</Button>
          </Stack>
        </Drawer>
      </Stack>
    </Fade>
  );
}
