import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { FolderOpen, Layers, Sun, Moon, Monitor } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const navItems = [
    { path: '/', label: 'Projects', icon: FolderOpen },
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
            <Link to="/" className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Screening Pipeline
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

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
