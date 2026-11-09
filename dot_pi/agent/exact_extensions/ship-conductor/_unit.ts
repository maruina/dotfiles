export type UnitDescriptor = { heading: string; taskNumbers: number[] };
export type ProgressStage = "execute" | "simplify";

type SliceInfo = { number: number; title: string; heading: string; order: number };
type TaskInfo = {
  number: number;
  title: string;
  sliceNumber: number | undefined;
  blockers: number[];
  checks: boolean[];
};
type ParsedPlan = { grouped: boolean; slices: SliceInfo[]; tasks: TaskInfo[] };

export type ExecutionUnitResult =
  | { ok: true; unit: UnitDescriptor }
  | { ok: false; reason: string };
export type ProgressValidationResult = { ok: true } | { ok: false; reason: string };

const MAX_TASKS = 1000;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TASK_START = /^Task\b/i;
const SLICE_START = /^Slice\b/i;

function failure(reason: string): never {
  throw new Error(reason);
}

function parseBlockers(lines: string[], taskNumber: number): number[] {
  const metadata = lines
    .map((line) => line.match(/^\s*\*\*Blocked by:\*\*\s*(.*?)\s*$/i)?.[1])
    .filter((value): value is string => value !== undefined);
  if (metadata.length > 1) failure(`Task ${taskNumber} has ambiguous Blocked by metadata`);
  if (metadata.length === 0 || /^(?:none|n\/a)$/i.test(metadata[0].trim())) return [];

  const raw = metadata[0];
  if (/\bapproval\b/i.test(raw)) failure(`Task ${taskNumber} has an unresolved approval prerequisite`);
  const matches = [...raw.matchAll(/\bTasks?\s+(\d+)(?:\s*[-–]\s*(\d+))?/gi)];
  if (matches.length === 0) failure(`Task ${taskNumber} has malformed Blocked by metadata: ${raw}`);
  const remainder = raw
    .replace(/\bTasks?\s+\d+(?:\s*[-–]\s*\d+)?/gi, "")
    .replace(/\band\b/gi, "")
    .replace(/[,&\s]/g, "");
  if (remainder !== "") failure(`Task ${taskNumber} has malformed Blocked by metadata: ${raw}`);

  const blockers = new Set<number>();
  for (const match of matches) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > MAX_TASKS) {
      failure(`Task ${taskNumber} has an invalid blocker range: ${match[0]}`);
    }
    for (let number = start; number <= end; number++) blockers.add(number);
  }
  return [...blockers].sort((a, b) => a - b);
}

function parsePlan(markdown: string): ParsedPlan {
  const lines = markdown.split(/\r?\n/);
  const slices: SliceInfo[] = [];
  const tasks: TaskInfo[] = [];
  const orphanChecks: boolean[] = [];
  const sliceNumbers = new Set<number>();
  const taskNumbers = new Set<number>();
  let currentSlice: SliceInfo | undefined;
  let currentTask: { task: TaskInfo; body: string[]; headingLevel: number } | undefined;
  let sawGroupedHeading = false;

  const finishTask = () => {
    if (!currentTask) return;
    currentTask.task.blockers = parseBlockers(currentTask.body, currentTask.task.number);
    if (currentTask.task.checks.length === 0) failure(`Task ${currentTask.task.number} has no checkboxes`);
    tasks.push(currentTask.task);
    currentTask = undefined;
  };

  for (const line of lines) {
    const headingMatch = line.match(HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      const startsSlice = SLICE_START.test(title);
      const startsTask = TASK_START.test(title);
      if (startsSlice || startsTask) finishTask();
      else if (currentTask && level <= currentTask.headingLevel) finishTask();

      if (startsSlice) {
        sawGroupedHeading = true;
        const parsed = title.match(/^Slice\s+(\d+)\s*:\s*(\S(?:.*\S)?)$/i);
        if (!parsed) failure(`Malformed or ambiguous execution slice heading: ${line}`);
        const number = Number(parsed[1]);
        if (!Number.isSafeInteger(number) || number < 1 || sliceNumbers.has(number)) {
          failure(`Duplicate or invalid execution slice number: ${parsed[1]}`);
        }
        sliceNumbers.add(number);
        currentSlice = { number, title: parsed[2], heading: `Slice ${number}: ${parsed[2]}`, order: slices.length };
        slices.push(currentSlice);
        continue;
      }

      if (startsTask) {
        const parsed = title.match(/^Task\s+(\d+)\s*:\s*(\S(?:.*\S)?)$/i);
        if (!parsed) failure(`Malformed or ambiguous task heading: ${line}`);
        const number = Number(parsed[1]);
        if (!Number.isSafeInteger(number) || number < 1 || number > MAX_TASKS || taskNumbers.has(number)) {
          failure(`Duplicate or invalid task number: ${parsed[1]}`);
        }
        taskNumbers.add(number);
        if (sawGroupedHeading && !currentSlice) failure(`Task ${number} is outside an execution slice`);
        currentTask = {
          task: { number, title: parsed[2], sliceNumber: currentSlice?.number, blockers: [], checks: [] },
          body: [],
          headingLevel: level,
        };
        continue;
      }

      if (level <= 2) currentSlice = undefined;
    }

    const checkbox = line.match(/^\s*(?:[-*+]|\d+\.)\s+\[([ xX])\]/);
    if (checkbox) {
      const done = checkbox[1].toLowerCase() === "x";
      if (currentTask) currentTask.task.checks.push(done);
      else orphanChecks.push(done);
    }
    if (currentTask) currentTask.body.push(line);
  }
  finishTask();

  const grouped = sawGroupedHeading;
  if (grouped && orphanChecks.length > 0) failure("Grouped plans contain checkboxes outside numbered tasks");
  if (!grouped && tasks.length > 0 && orphanChecks.length > 0) {
    failure("Plan mixes numbered tasks with unowned checklist items");
  }
  if (tasks.length === 0 && orphanChecks.length > 0) {
    if (orphanChecks.length > MAX_TASKS) failure(`Plan has more than ${MAX_TASKS} checklist items`);
    for (let index = 0; index < orphanChecks.length; index++) {
      tasks.push({ number: index + 1, title: `Checklist item ${index + 1}`, sliceNumber: undefined, blockers: [], checks: [orphanChecks[index]] });
    }
  }
  if (tasks.length === 0) failure("Plan has no numbered tasks or checklist items");
  if (grouped && slices.length === 0) failure("Grouped plan has no valid execution slices");
  return { grouped, slices, tasks };
}

function isComplete(task: TaskInfo): boolean {
  return task.checks.every(Boolean);
}

function validateDependencies(plan: ParsedPlan, selected: Set<number>, sliceOrder: number | undefined): string | undefined {
  const byNumber = new Map(plan.tasks.map((task) => [task.number, task]));
  for (const task of plan.tasks.filter((candidate) => selected.has(candidate.number))) {
    for (const blockerNumber of task.blockers) {
      const blocker = byNumber.get(blockerNumber);
      if (!blocker) return `Task ${task.number} is blocked by missing Task ${blockerNumber}`;
      if (isComplete(blocker)) continue;
      if (sliceOrder !== undefined && blocker.sliceNumber !== undefined) {
        const blockerSlice = plan.slices.find((slice) => slice.number === blocker.sliceNumber);
        if (blockerSlice && blockerSlice.order > sliceOrder) {
          return `Task ${task.number} is blocked by Task ${blockerNumber} in a future slice`;
        }
        if (blocker.sliceNumber === plan.tasks.find((candidate) => candidate.number === task.number)?.sliceNumber && selected.has(blockerNumber)) {
          continue;
        }
      } else if (selected.has(blockerNumber)) {
        continue;
      }
      return `Task ${task.number} is blocked by incomplete Task ${blockerNumber}`;
    }
  }
  return dependencyCycle(plan.tasks, selected);
}

function dependencyCycle(tasks: TaskInfo[], selected: Set<number>): string | undefined {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (number: number): boolean => {
    if (visiting.has(number)) return true;
    if (visited.has(number)) return false;
    visiting.add(number);
    const task = byNumber.get(number);
    for (const blocker of task?.blockers ?? []) {
      if (selected.has(blocker) && visit(blocker)) return true;
    }
    visiting.delete(number);
    visited.add(number);
    return false;
  };
  for (const number of selected) {
    if (visit(number)) return "Selected execution unit contains a cyclic task dependency";
  }
  return undefined;
}

export function selectExecutionUnit(markdown: string): ExecutionUnitResult {
  let plan: ParsedPlan;
  try {
    plan = parsePlan(markdown);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const incomplete = plan.tasks.filter((task) => !isComplete(task));
  if (incomplete.length === 0) return { ok: false, reason: "Plan has no remaining incomplete tasks" };

  let selected: TaskInfo[];
  let heading: string;
  let sliceOrder: number | undefined;
  if (plan.grouped) {
    const slice = plan.slices.find((candidate) => plan.tasks.some((task) => task.sliceNumber === candidate.number && !isComplete(task)));
    if (!slice) return { ok: false, reason: "Grouped plan has no remaining incomplete slice" };
    selected = plan.tasks.filter((task) => task.sliceNumber === slice.number && !isComplete(task));
    heading = slice.heading;
    sliceOrder = slice.order;
  } else {
    selected = incomplete;
    heading = "All remaining plan tasks";
  }

  const selectedNumbers = new Set(selected.map((task) => task.number));
  const dependencyError = validateDependencies(plan, selectedNumbers, sliceOrder);
  if (dependencyError) return { ok: false, reason: dependencyError };
  return {
    ok: true,
    unit: { heading, taskNumbers: selected.map((task) => task.number).sort((a, b) => a - b) },
  };
}

function sameTaskShape(left: TaskInfo, right: TaskInfo): boolean {
  return left.number === right.number && left.title === right.title && left.sliceNumber === right.sliceNumber &&
    JSON.stringify(left.blockers) === JSON.stringify(right.blockers) && left.checks.length === right.checks.length;
}

export function validatePlanProgress(
  beforeMarkdown: string,
  afterMarkdown: string,
  unit: UnitDescriptor,
  stage: ProgressStage,
): ProgressValidationResult {
  let before: ParsedPlan;
  let after: ParsedPlan;
  try {
    before = parsePlan(beforeMarkdown);
    after = parsePlan(afterMarkdown);
  } catch (error) {
    return { ok: false, reason: `Plan progress is malformed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (before.grouped !== after.grouped || JSON.stringify(before.slices.map(({ number, title }) => [number, title])) !== JSON.stringify(after.slices.map(({ number, title }) => [number, title]))) {
    return { ok: false, reason: "Plan slice scope changed during the lifecycle stage" };
  }
  if (before.tasks.length !== after.tasks.length || before.tasks.some((task, index) => !sameTaskShape(task, after.tasks[index]))) {
    return { ok: false, reason: "Plan task scope or prerequisites changed during the lifecycle stage" };
  }

  const selected = new Set(unit.taskNumbers);
  if (selected.size !== unit.taskNumbers.length || unit.taskNumbers.length === 0) {
    return { ok: false, reason: "Pinned execution unit has invalid task numbers" };
  }
  const known = new Set(before.tasks.map((task) => task.number));
  if (unit.taskNumbers.some((number) => !known.has(number))) return { ok: false, reason: "Pinned execution unit no longer matches the plan" };

  for (let index = 0; index < before.tasks.length; index++) {
    const previous = before.tasks[index];
    const current = after.tasks[index];
    const previousState = previous.checks;
    const currentState = current.checks;
    if (stage === "execute" && selected.has(previous.number)) {
      if (!currentState.every(Boolean)) return { ok: false, reason: `Execute did not complete every checkbox for Task ${previous.number}` };
    } else if (JSON.stringify(previousState) !== JSON.stringify(currentState)) {
      return { ok: false, reason: `Plan progress changed out-of-unit (Task ${previous.number})` };
    }
  }
  return { ok: true };
}
