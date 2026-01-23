/**
 * Search and filter component for paper lists.
 */
import { Search, X, Filter } from 'lucide-react';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';

export interface FilterOption {
  id: string;
  label: string;
  value: string;
  count?: number;
}

export interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  filters?: FilterOption[];
  activeFilters?: string[];
  onFilterChange?: (filterId: string) => void;
  className?: string;
}

export function SearchFilter({
  searchQuery,
  onSearchChange,
  placeholder = 'Search papers...',
  filters = [],
  activeFilters = [],
  onFilterChange,
  className,
}: SearchFilterProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-9 bg-[hsl(var(--background))] border-[hsl(var(--border))]"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          {filters.map((filter) => {
            const isActive = activeFilters.includes(filter.id);
            return (
              <button
                key={filter.id}
                onClick={() => onFilterChange?.(filter.id)}
                className={cn(
                  'px-3 py-1 text-sm rounded-full border transition-colors',
                  isActive
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]'
                    : 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
                )}
              >
                {filter.label}
                {filter.count !== undefined && (
                  <span className="ml-1 opacity-70">({filter.count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
