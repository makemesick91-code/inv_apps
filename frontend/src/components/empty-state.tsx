import type { LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-slate-100 rounded-full p-4 mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && (
        <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
