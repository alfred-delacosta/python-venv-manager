/* Copyright Advanced Software and AI Solutions LLC */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
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

type Candidate = {
  folder: string;
  venvPath: string;
  suggestedSlug: string;
  suggestedName: string;
  collision: boolean;
};

export function ImportPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const [scanRoot, setScanRoot] = useState('');
  const [foldersText, setFoldersText] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      const folders = foldersText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await api('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          scanRoot: scanRoot || undefined,
          folders: folders.length ? folders : undefined,
        }),
      });
      const body = (await res.json()) as { candidates?: Candidate[]; error?: string };
      if (!res.ok) throw new Error(body.error || 'Preview failed');
      setCandidates(body.candidates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function importAll() {
    setBusy(true);
    setError(null);
    try {
      const folders = candidates.filter((c) => !c.collision).map((c) => c.folder);
      const res = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          type: 'register-bulk',
          folders,
          scanRoot: scanRoot || undefined,
        }),
      });
      const body = (await res.json()) as { job?: { id: number }; error?: string };
      if (!res.ok) throw new Error(body.error || 'Import failed');
      navigate(`/jobs/${body.job!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={3} maxWidth={900}>
      <Typography variant="h4" component="h1">
        Bulk import
      </Typography>
      <Typography color="text.secondary">
        Scan a root for project folders with .venv, or paste absolute folder paths. Collisions are skipped.
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="Scan root (absolute)"
            value={scanRoot}
            onChange={(e) => setScanRoot(e.target.value)}
          />
          <TextField
            label="Absolute folders (one per line)"
            value={foldersText}
            onChange={(e) => setFoldersText(e.target.value)}
            multiline
            minRows={4}
          />
          {error && (
            <Typography color="error" role="alert">
              {error}
            </Typography>
          )}
          <Stack direction="row" gap={1}>
            <Button variant="outlined" onClick={() => void preview()} disabled={busy}>
              Preview
            </Button>
            <Button
              variant="contained"
              onClick={() => void importAll()}
              disabled={busy || candidates.filter((c) => !c.collision).length === 0}
            >
              Import non-colliding
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {candidates.length === 0 ? (
          <Typography color="text.secondary">No preview yet.</Typography>
        ) : (
          <Table aria-label="Import preview">
            <TableHead>
              <TableRow>
                <TableCell>Slug</TableCell>
                <TableCell>Folder</TableCell>
                <TableCell>Venv</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.folder}>
                  <TableCell>{c.suggestedSlug}</TableCell>
                  <TableCell>{c.folder}</TableCell>
                  <TableCell>{c.venvPath}</TableCell>
                  <TableCell>{c.collision ? 'collision' : 'ready'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
