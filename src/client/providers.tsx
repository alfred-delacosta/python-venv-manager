/* Copyright Advanced Software and AI Solutions LLC */
import { useMemo, useState, type ReactNode } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { SessionProvider } from './session';

function readNonce(): string | undefined {
  return document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? undefined;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pyapps-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const cache = useMemo(
    () =>
      createCache({
        key: 'pyapps',
        nonce: readNonce(),
        prepend: true,
      }),
    [],
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === 'light' ? '#0b6e4f' : '#3dd68c' },
          secondary: { main: mode === 'light' ? '#1b4332' : '#95d5b2' },
          background: {
            default: mode === 'light' ? '#f3f6f4' : '#0f1412',
            paper: mode === 'light' ? '#ffffff' : '#18201c',
          },
        },
        typography: {
          fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
          h4: { fontWeight: 700 },
        },
        shape: { borderRadius: 8 },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                minHeight: 44,
                minWidth: 44,
                textTransform: 'none',
              },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: { minHeight: 44, minWidth: 44 },
            },
          },
        },
      }),
    [mode],
  );

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SessionProvider themeMode={mode} setThemeMode={(next) => {
          setMode(next);
          localStorage.setItem('pyapps-theme', next);
        }}>
          {children}
        </SessionProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}
