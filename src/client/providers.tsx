/* Copyright Advanced Software and AI Solutions LLC */
import { useMemo, useState, type ReactNode } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { SessionProvider } from './session';
import { prefersReducedMotion } from './motion';

function readNonce(): string | undefined {
  return document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content') ?? undefined;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pyapps-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const reduceMotion = prefersReducedMotion();

  // Nonce comes from the server-injected meta tag on every HTML response.
  // Without it, Emotion <style> tags are blocked by CSP and MUI looks unstyled.
  const cache = useMemo(() => {
    const nonce = readNonce();
    return createCache({
      key: 'pyapps',
      nonce,
      prepend: true,
    });
  }, []);

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
        transitions: {
          duration: {
            shortest: reduceMotion ? 0 : 150,
            shorter: reduceMotion ? 0 : 200,
            short: reduceMotion ? 0 : 250,
            standard: reduceMotion ? 0 : 300,
            complex: reduceMotion ? 0 : 300,
            enteringScreen: reduceMotion ? 0 : 225,
            leavingScreen: reduceMotion ? 0 : 195,
          },
        },
        components: {
          MuiButton: {
            defaultProps: { disableRipple: reduceMotion },
            styleOverrides: {
              root: {
                minHeight: 44,
                minWidth: 44,
                textTransform: 'none',
              },
            },
          },
          MuiIconButton: {
            defaultProps: { disableRipple: reduceMotion },
            styleOverrides: {
              root: { minHeight: 44, minWidth: 44 },
            },
          },
          MuiCssBaseline: {
            styleOverrides: reduceMotion
              ? { html: { scrollBehavior: 'auto' } }
              : undefined,
          },
        },
      }),
    [mode, reduceMotion],
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
