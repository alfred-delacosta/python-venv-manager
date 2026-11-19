/* Copyright Advanced Software and AI Solutions LLC */
import { Route, Routes } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { Layout } from './layout';
import { useSession } from './session';
import { DashboardPage } from './pages/DashboardPage';
import { AddWizardPage } from './pages/AddWizardPage';
import { DetailPage } from './pages/DetailPage';
import { JobsPage } from './pages/JobsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HealthPage } from './pages/HealthPage';

export default function App() {
  const { loading, error } = useSession();
  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight="100vh" gap={2}>
        <CircularProgress />
        <Typography>Loading session</Typography>
      </Stack>
    );
  }
  if (error) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight="100vh">
        <Typography color="error">{error}</Typography>
      </Stack>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/add" element={<AddWizardPage />} />
        <Route path="/apps/:slug" element={<DetailPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/health" element={<HealthPage />} />
      </Routes>
    </Layout>
  );
}
