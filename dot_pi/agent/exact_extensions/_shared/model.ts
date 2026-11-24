export function qualifiedId(provider: string, id: string): string {
  return id.startsWith(`${provider}/`) ? id : `${provider}/${id}`;
}
