import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type PiProfile = "work" | "personal";

let cachedProfile: PiProfile | undefined;

export function getProfile(env: NodeJS.ProcessEnv = process.env, profilePath?: string): PiProfile {
  if (profilePath !== undefined) {
    const parsed = JSON.parse(readFileSync(profilePath, "utf8")) as { profile?: unknown };
    if (parsed.profile === "work" || parsed.profile === "personal") return parsed.profile;
    throw new Error("Unknown publication profile");
  }
  const override = env.PI_PROFILE;
  if (override === "work" || override === "personal") return override;
  if (cachedProfile !== undefined) return cachedProfile;
  const defaultPath = path.join(import.meta.dirname, "profile.json");
  if (existsSync(defaultPath)) {
    try {
      const parsed = JSON.parse(readFileSync(defaultPath, "utf8")) as { profile?: unknown };
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
