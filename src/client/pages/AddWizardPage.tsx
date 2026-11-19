/* Copyright Advanced Software and AI Solutions LLC */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
  Checkbox,
} from '@mui/material';
import { useSession } from '../session';

export function AddWizardPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const [kind, setKind] = useState<'app' | 'project'>('app');
  const [mode, setMode] = useState<'pypi' | 'github' | 'local' | 'register'>('pypi');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [requirement, setRequirement] = useState('');
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [folder, setFolder] = useState('');
  const [editable, setEditable] = useState(false);
  const [python, setPython] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'register') {
        body = {
          type: 'register',
          kind,
          slug,
          name,
          folder,
        };
      } else if (kind === 'project') {
        body = {
          type: 'install-project',
          slug,
          name,
          folder,
          editable,
          python: python || undefined,
        };
      } else {
        const source =
          mode === 'pypi'
            ? { type: 'pypi', requirement }
            : mode === 'github'
              ? { type: 'github', url, ref: ref || undefined }
              : { type: 'local', folder, editable };
        body = {
          type: 'install-app',
          slug,
          name,
          source,
          python: python || undefined,
        };
      }
      const res = await api('/api/jobs', { method: 'POST', body: JSON.stringify(body) });
      const data = (await res.json()) as { job?: { id: number }; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to enqueue job');
      navigate(`/jobs/${data.job!.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2} maxWidth={640}>
      <Typography variant="h4" component="h1">
        Add wizard
      </Typography>
      <Typography color="text.secondary">
        Install an app into its own venv, or register a project folder.
      </Typography>
      <FormControl>
        <FormLabel id="kind-label">Kind</FormLabel>
        <RadioGroup
          row
          aria-labelledby="kind-label"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'app' | 'project')}
        >
          <FormControlLabel value="app" control={<Radio />} label="App" />
          <FormControlLabel value="project" control={<Radio />} label="Project" />
        </RadioGroup>
      </FormControl>
      {kind === 'app' && (
        <TextField
          select
          label="Source"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <MenuItem value="pypi">PyPI</MenuItem>
          <MenuItem value="github">GitHub</MenuItem>
          <MenuItem value="local">Local folder</MenuItem>
          <MenuItem value="register">Register existing venv</MenuItem>
        </TextField>
      )}
      {kind === 'project' && (
        <TextField
          select
          label="Action"
          value={mode === 'register' ? 'register' : 'local'}
          onChange={(e) => setMode(e.target.value === 'register' ? 'register' : 'local')}
        >
          <MenuItem value="local">Install into project .venv</MenuItem>
          <MenuItem value="register">Register existing project venv</MenuItem>
        </TextField>
      )}
      <TextField label="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} required helperText="Lowercase letters, numbers, hyphens" />
      {mode === 'pypi' && kind === 'app' && (
        <TextField
          label="PyPI requirement"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="crwl"
          required
        />
      )}
      {mode === 'github' && kind === 'app' && (
        <>
          <TextField
            label="GitHub URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            required
          />
          <TextField label="Optional ref" value={ref} onChange={(e) => setRef(e.target.value)} />
        </>
      )}
      {(mode === 'local' || mode === 'register' || kind === 'project') && (
        <TextField
          label="Absolute folder path"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          required
        />
      )}
      {(mode === 'local' || kind === 'project') && mode !== 'register' && (
        <FormControlLabel
          control={<Checkbox checked={editable} onChange={(e) => setEditable(e.target.checked)} />}
          label="Editable install"
        />
      )}
      {mode !== 'register' && (
        <TextField
          label="Python selector (optional)"
          value={python}
          onChange={(e) => setPython(e.target.value)}
          helperText="Passed to uv venv --python when set"
        />
      )}
      {error && (
        <Typography color="error" role="alert">
          {error}
        </Typography>
      )}
      <Button variant="contained" onClick={() => void submit()} disabled={busy || !name || !slug}>
        {busy ? 'Starting job' : 'Start install'}
      </Button>
    </Stack>
  );
}
