import { format, formatDistanceToNow } from 'date-fns';

export function formatTimestamp(date: Date): string {
  return format(date, 'yyyy-MM-dd HH:mm:ss');
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getCurrentTimestamp(): string {
  return formatTimestamp(new Date());
}


