import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { FolderOpen, Layers, Sun, Moon, Monitor, Github, Database } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { path: '/', label: 'Projects', icon: FolderOpen },
    { path: '/imports', label: 'Imports', icon: Database },
    { path: '/step-types', label: 'Step Types', icon: Layers },
  ];

  const themeOptions = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              <img src="/brain.svg" alt="" className="h-6 w-6" />
              SLR Pipeline
            </Link>

            <div className="flex items-center gap-4">
              <nav className="flex space-x-1">
                {navItems.map(({ path, label, icon: Icon }) => {
                  const isActive = path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(path);

                  return (
                    <Link
                      key={path}
                      to={path}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                        isActive
                          ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>

              {/* Theme Toggle */}
              <div className="flex items-center bg-[hsl(var(--muted))] rounded-lg p-1">
                {themeOptions.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      theme === value
                        ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                        : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                    )}
                    title={label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
          {children}
        </main>
        <footer className="border-t border-[hsl(var(--border))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-xs text-[hsl(var(--muted-foreground))] flex items-center justify-end gap-3">
            <a
              href="https://github.com/s1m4ne/decompile-survey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[hsl(var(--foreground))] transition-colors"
            >
              <Github className="h-3.5 w-3.5" />
              Repository
            </a>
            <span className="text-[hsl(var(--border))]">•</span>
            <span>© 2026 s1m4ne. MIT License.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
