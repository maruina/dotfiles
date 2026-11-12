import type { ProgramStatus, Terminal } from "@earendil-works/pi-tui";

export type LifecycleRestingState = "idle" | "done" | "error";

export function reportLifecycleActivity(terminal: Terminal): (state?: LifecycleRestingState) => void {
  const original = terminal.setProgramStatus;
  const working: ProgramStatus = { state: "working", app: "pi", message: "/implement" };
  // deliberate: Pi 1.5.0 has no background-activity API. Scope this writer override to /implement;
  // replace it with a native activity lease when Pi exposes one. Keep native capability detection and dialogs.
  terminal.setProgramStatus = (status) => original.call(
    terminal,
    status.state === "blocked" || status.state === "clear" ? status : working,
  );
  terminal.setProgramStatus(working);
  let stopped = false;
  return (state = "idle") => {
    if (stopped) return;
    stopped = true;
    terminal.setProgramStatus = original;
    original.call(terminal, { state, app: "pi", message: "/implement" });
  };
}
