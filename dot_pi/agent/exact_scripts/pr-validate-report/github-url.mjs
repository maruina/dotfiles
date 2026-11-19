export function parsePullRequestUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_url');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port) {
    throw new Error('invalid_url');
  }

  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([0-9]+)\/?$/.exec(url.pathname);
  if (!match) throw new Error('invalid_url');
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('invalid_url');

  const [, owner, repo] = match;
  return { owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
}

export function githubRemoteIdentity(value) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(value);
  if (!match || match.slice(1).some((part) => part === '.' || part === '..')) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}
