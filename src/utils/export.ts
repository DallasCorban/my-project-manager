// Export/import utilities — CSV export and JSON backup/restore.

import type { Board } from '../types/board';

/**
 * Export project data as CSV.
 */
export function exportProjectAsCsv(project: Board): string {
  const headers = ['Group', 'Task', 'Status', 'Type', 'Assignee', 'Priority', 'Start', 'Duration'];
  const rows: string[][] = [];

  for (const group of project.groups) {
    const groupTasks = project.tasks.filter((t) => t.groupId === group.id);
    for (const task of groupTasks) {
      rows.push([
        group.name,
        task.name,
        task.status || '',
        task.jobTypeId || '',
        task.assignee || '',
        task.priority || '',
        task.start || '',
        String(task.duration || ''),
      ]);

      // Subitems
      for (const sub of task.subitems) {
        rows.push([
          group.name,
          `  ↳ ${sub.name}`,
          sub.status || '',
          sub.jobTypeId || '',
          sub.assignee || '',
          '',
          sub.start || '',
          String(sub.duration || ''),
        ]);
      }
    }
  }

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n');

  return csvContent;
}

/**
 * Download a string as a file.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export project data as JSON backup.
 */
export function exportProjectAsJson(project: Board): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Export all projects as JSON backup.
 */
export function exportAllProjectsAsJson(projects: Board[]): string {
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), projects }, null, 2);
}

/**
 * Import projects from JSON backup.
 */
export function importProjectsFromJson(json: string): Board[] | null {
  try {
    const data = JSON.parse(json);

    // Handle v2 format (exported via exportAllProjectsAsJson)
    if (data.version === 2 && Array.isArray(data.projects)) {
      return data.projects as Board[];
    }

    // Handle single project format
    if (data.id && data.groups && data.tasks) {
      return [data as Board];
    }

    // Handle raw array format
    if (Array.isArray(data)) {
      return data as Board[];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Helper to download a project as CSV.
 */
export function downloadProjectCsv(project: Board): void {
  const csv = exportProjectAsCsv(project);
  downloadFile(csv, `${project.name}.csv`, 'text/csv');
}

/**
 * Helper to download all projects as JSON backup.
 */
export function downloadProjectsBackup(projects: Board[]): void {
  const json = exportAllProjectsAsJson(projects);
  downloadFile(json, `flow-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
}
