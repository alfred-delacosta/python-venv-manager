/* Copyright Advanced Software and AI Solutions LLC */
import { useEffect, useState } from 'react';
import { Button, Stack, TextField, Typography, Paper } from '@mui/material';
import { useSession } from '../session';

export function SettingsPage() {
  const { api } = useSession();
  const [home, setHome] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState<number | ''>('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api('/api/settings')
      .then(async (res) => {
        const data = (await res.json()) as { home: string; host: string; port: number };
        setHome(data.home);
        setHost(data.host);
        setPort(data.port);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

  async function save() {
    setMessage(null);
    setError(null);
    const res = await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ pyappsHome: home }),
    });
    const data = (await res.json()) as { home?: string; error?: string };
    if (!res.ok) {
      setError(data.error || 'Save failed');
      return;
    }
    setHome(data.home ?? home);
    setMessage('Home folder updated.');
  }

  return (
    <Stack spacing={3} maxWidth={640}>
      <Typography variant="h4" component="h1">
        Settings
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="Apps home folder"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            helperText="Apps install under this folder as <home>/<slug>/.venv"
          />
          <TextField label="Bind host" value={host} InputProps={{ readOnly: true }} helperText="Change HOST in .env and restart" />
          <TextField label="Port" value={port} InputProps={{ readOnly: true }} helperText="Change PORT in .env and restart" />
          {error && (
            <Typography color="error" role="alert">
              {error}
            </Typography>
          )}
          {message && <Typography color="success.main">{message}</Typography>}
          <Button variant="contained" onClick={() => void save()}>
            Save home folder
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
