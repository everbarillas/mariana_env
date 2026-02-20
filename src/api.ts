import type { Project, Task } from './types/types';

const DEFAULT_BASE_URL = 'http://localhost:4500';

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;
}

async function fetchJson<T>(path: string): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getProjects() {
  return fetchJson<Project[]>('/projects');
}

export function getProjectTasks(projectId: number) {
  return fetchJson<Task[]>(`/projects/${projectId}/tasks`);
}

