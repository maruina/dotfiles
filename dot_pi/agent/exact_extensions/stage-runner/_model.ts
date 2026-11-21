export function qualifiedId(provider: string, id: string) {
  return id.startsWith(provider + "/") ? id : provider + "/" + id;
}
