/**
 * Canonical path resolution for runtime, build, CLI, and tests.
 */
import path from 'path';
import { fileURLToPath } from 'url';

export interface ProjectPaths {
  projectRoot: string;
  runtimeDataPath: string;
  sourcePatternsPath: string;
  databasePath: string;
}

function pathFromSegments(segments: string[]): string {
  const resolved = segments.join(path.sep);
  return resolved === '' ? path.sep : resolved;
}

export function resolveProjectRoot(moduleUrl: string = import.meta.url): string {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const segments = moduleDir.split(path.sep);
  const distIndex = segments.lastIndexOf('dist');

  if (distIndex > 0) {
    return pathFromSegments(segments.slice(0, distIndex));
  }

  const srcIndex = segments.lastIndexOf('src');
  if (srcIndex > 0) {
    return pathFromSegments(segments.slice(0, srcIndex));
  }

  return process.cwd();
}

export function resolveRuntimeDataPath(moduleUrl: string = import.meta.url): string {
  return path.join(resolveProjectRoot(moduleUrl), 'data');
}

export function resolvePatternsPath(moduleUrl: string = import.meta.url): string {
  return path.join(resolveRuntimeDataPath(moduleUrl), 'patterns');
}

export function resolveDatabasePath(
  databasePath?: string,
  moduleUrl: string = import.meta.url
): string {
  return databasePath ?? path.join(resolveRuntimeDataPath(moduleUrl), 'design-patterns.db');
}

export function resolveProjectPaths(
  moduleUrl: string = import.meta.url,
  databasePath?: string
): ProjectPaths {
  const projectRoot = resolveProjectRoot(moduleUrl);
  const runtimeDataPath = path.join(projectRoot, 'data');

  return {
    projectRoot,
    runtimeDataPath,
    sourcePatternsPath: path.join(runtimeDataPath, 'patterns'),
    databasePath: databasePath ?? path.join(runtimeDataPath, 'design-patterns.db'),
  };
}
