/* Copyright Advanced Software and AI Solutions LLC */
import { Route, Routes, useLocation } from 'react-router-dom';
import { CircularProgress, Fade, Stack, Typography } from '@mui/material';
import { Layout } from './layout';
import { useSession } from './session';
import { DashboardPage } from './pages/DashboardPage';
import { AddWizardPage } from './pages/AddWizardPage';
import { DetailPage } from './pages/DetailPage';
import { JobsPage } from './pages/JobsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HealthPage } from './pages/HealthPage';
import { HistoryPage } from './pages/HistoryPage';
import { AuditPage } from './pages/AuditPage';
import { LiveRunPage } from './pages/LiveRunPage';
import { ImportPage } from './pages/ImportPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { motionDuration } from './motion';

export default function App() {
  const { loading, error } = useSession();
  const location = useLocation();
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
      <Fade key={location.pathname} in timeout={motionDuration(200)}>
        <div>
          <Routes location={location}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/add" element={<AddWizardPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/apps/:slug" element={<DetailPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:id" element={<JobsPage />} />
            <Route path="/live/run/:id" element={<LiveRunPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/health" element={<HealthPage />} />
          </Routes>
        </div>
      </Fade>
    </Layout>
  );
}
