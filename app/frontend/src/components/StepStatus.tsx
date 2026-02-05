import { AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Badge } from './ui/Badge';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-[hsl(var(--status-success-fg))]" />;
    case 'running':
      return <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--status-info))]" />;
    case 'failed':
      return <AlertCircle className="w-5 h-5 text-[hsl(var(--status-danger-fg))]" />;
    default:
      return <Clock className="w-5 h-5 text-[hsl(var(--status-neutral))]" />;
  }
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return <Badge variant="success">Completed</Badge>;
    case 'running':
      return <Badge variant="warning">Running</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}
