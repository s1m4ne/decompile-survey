import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { StepDetailPage } from './pages/StepDetailPage';
import { StepTypesPage } from './pages/StepTypesPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/projects/:projectId/steps/:stepId" element={<StepDetailPage />} />
              <Route path="/projects/:projectId/sources" element={<SourcesPlaceholder />} />
              <Route path="/step-types" element={<StepTypesPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Placeholder components for routes not yet implemented
function SourcesPlaceholder() {
  return (
    <div className="text-center py-12">
      <p className="text-[hsl(var(--muted-foreground))]">
        Sources management will be implemented here
      </p>
    </div>
  );
}

export default App;
