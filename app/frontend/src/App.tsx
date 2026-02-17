import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { StepDetailPage } from './pages/StepDetailPage';
import { StepTypesPage } from './pages/StepTypesPage';
import { SourcesPage } from './pages/SourcesPage';
import { ImportsPage } from './pages/ImportsPage';
import { ImportDetailPage } from './pages/ImportDetailPage';
import { ImportQuerySearchPage } from './pages/ImportQuerySearchPage';
import { PdfLibraryPage } from './pages/PdfLibraryPage';

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
              <Route path="/projects/:projectId/sources" element={<SourcesPage />} />
              <Route path="/imports" element={<ImportsPage />} />
              <Route path="/imports/:importId" element={<ImportDetailPage />} />
              <Route path="/imports/:importId/query-search" element={<ImportQuerySearchPage />} />
              <Route path="/pdf-library" element={<PdfLibraryPage />} />
              <Route path="/step-types" element={<StepTypesPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
