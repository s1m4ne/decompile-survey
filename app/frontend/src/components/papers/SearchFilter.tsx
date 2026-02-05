/**
 * Search component for paper lists.
 */
import { Search, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';

export interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchFilter({
  searchQuery,
  onSearchChange,
  placeholder = 'Search papers...',
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
    </div>
  );
}
