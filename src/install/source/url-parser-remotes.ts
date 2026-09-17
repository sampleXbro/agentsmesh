/**
 * GitHub / GitLab tree URL and SSH helpers for install source parsing.
 */

import { URL } from 'node:url';

interface RefUrl {
  ref: string;
  path: string;
}

/** `https://github.com/org/repo/<marker>/ref/rest` — `marker` is `tree` or `blob`. */
function parseGithubRefUrl(
  urlStr: string,
  marker: 'tree' | 'blob',
  requirePath: boolean,
): (RefUrl & { org: string; repo: string }) | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const mi = parts.indexOf(marker);
    if (mi < 2 || mi + 1 >= parts.length) return null;
    const [org, repo] = parts;
    const ref = parts[mi + 1];
    const path = parts.slice(mi + 2).join('/');
    if (!org || !repo || !ref || (requirePath && !path)) return null;
    return { org, repo, ref, path };
  } catch {
    return null;
  }
}

/** `https://gitlab.com/group/project/-/<marker>/ref/path` — `marker` is `tree` or `blob`. */
function parseGitlabRefUrl(
  urlStr: string,
  marker: 'tree' | 'blob',
  requirePath: boolean,
): (RefUrl & { namespace: string; project: string }) | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== 'gitlab.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const dash = parts.indexOf('-');
    if (dash < 0 || parts[dash + 1] !== marker) return null;
    const markerIdx = dash + 1;
    if (markerIdx + 1 >= parts.length) return null;
    const ref = parts[markerIdx + 1];
    const path = parts.slice(markerIdx + 2).join('/');
    const before = parts.slice(0, dash);
    if (before.length < 2) return null;
    const project = before[before.length - 1];
    const namespace = before.slice(0, -1).join('/');
    if (!namespace || !project || !ref || (requirePath && !path)) return null;
    return { namespace, project, ref, path };
  } catch {
    return null;
  }
}

export const parseGithubTreeUrl = (urlStr: string) => parseGithubRefUrl(urlStr, 'tree', false);
export const parseGithubBlobUrl = (urlStr: string) => parseGithubRefUrl(urlStr, 'blob', true);
export const parseGitlabTreeUrl = (urlStr: string) => parseGitlabRefUrl(urlStr, 'tree', false);
export const parseGitlabBlobUrl = (urlStr: string) => parseGitlabRefUrl(urlStr, 'blob', true);

/** Known GitHub route segments that indicate a non-repo URL (3+ path segments). */
const GITHUB_ROUTE_WORDS = new Set([
  'tree',
  'blob',
  'commit',
  'releases',
  'actions',
  'issues',
  'pulls',
  'settings',
  'wiki',
  'discussions',
  'security',
  'projects',
  'packages',
]);

/** GitHub bare repo: https://github.com/org/repo[.git] */
export function parseGithubRepoUrl(urlStr: string): { org: string; repo: string } | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/\.git$/i, ''));
    if (parts.length < 2) return null;
    if (parts.length > 2 || GITHUB_ROUTE_WORDS.has(parts[1]!)) return null;
    const org = parts[0]!;
    const repo = parts[1]!;
    return { org, repo };
  } catch {
    return null;
  }
}

/** GitLab bare repo: https://gitlab.com/namespace/project[.git] */
export function parseGitlabRepoUrl(urlStr: string): { namespace: string; project: string } | null {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== 'gitlab.com') return null;
    const parts = u.pathname
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/\.git$/i, ''));
    if (parts.length < 2) return null;
    if (parts.includes('-')) return null;
    const project = parts[parts.length - 1]!;
    const namespace = parts.slice(0, -1).join('/');
    if (!namespace || !project) return null;
    return { namespace, project };
  } catch {
    return null;
  }
}

/** git@github.com:org/repo.git */
export function parseGitSshGithub(ssh: string): { org: string; repo: string } | null {
  const m = ssh.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (!m) return null;
  return { org: m[1]!, repo: m[2]!.replace(/\.git$/i, '') };
}

export function parseGitSshGitlab(ssh: string): { namespace: string; project: string } | null {
  const m = ssh.match(/^git@gitlab\.com:(.+?)(?:\.git)?$/i);
  if (!m) return null;
  const rest = m[1]!.replace(/\.git$/i, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const project = parts[parts.length - 1]!;
  const namespace = parts.slice(0, -1).join('/');
  return { namespace, project };
}
