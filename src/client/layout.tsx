/* Copyright Advanced Software and AI Solutions LLC */
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Container,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useSession } from './session';

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/add', label: 'Add' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/settings', label: 'Settings' },
  { to: '/health', label: 'Health' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { session, api, themeMode, setThemeMode } = useSession();
  const location = useLocation();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="primary" enableColorOnDark>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Python Venv Manager
          </Typography>
          {nav.map((item) => (
            <Button
              key={item.to}
              component={RouterLink}
              to={item.to}
              color="inherit"
              variant={location.pathname === item.to ? 'outlined' : 'text'}
              sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
            >
              {item.label}
            </Button>
          ))}
          <IconButton
            color="inherit"
            aria-label={themeMode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
          >
            {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
          <Typography variant="body2" sx={{ mx: 1 }}>
            {session?.username}
          </Typography>
          <Button
            color="inherit"
            onClick={() => {
              void api('/logout', {
                method: 'POST',
                body: JSON.stringify({ csrf: session?.csrfToken }),
                headers: { 'Content-Type': 'application/json' },
              }).then(() => {
                window.location.href = '/login';
              });
            }}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3, flex: 1 }}>
        {children}
      </Container>
      <Box component="footer" sx={{ py: 2, textAlign: 'center', opacity: 0.8 }}>
        <Typography variant="body2">{session?.footer}</Typography>
      </Box>
    </Box>
  );
}
