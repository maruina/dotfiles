import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type PiProfile = "work" | "personal";

let cachedProfile: PiProfile | undefined;

export function getProfile(env: NodeJS.ProcessEnv = process.env): PiProfile {
  const override = env.PI_PROFILE;
  if (override === "work" || override === "personal") return override;
  if (cachedProfile !== undefined) return cachedProfile;
  const profilePath = path.join(import.meta.dirname, "profile.json");
  if (existsSync(profilePath)) {
    try {
      const parsed = JSON.parse(readFileSync(profilePath, "utf8")) as { profile?: unknown };
      if (parsed.profile === "work" || parsed.profile === "personal") {
        cachedProfile = parsed.profile;
        return cachedProfile;
      }
    } catch {
      // Fall through to default when unrendered or unreadable.
    }
  }
  return "work";
}
