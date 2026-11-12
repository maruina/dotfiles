import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { selectExecutionUnit, validatePlanProgress } from "./_unit.ts";

const groupedPlan = `# Plan

### Slice 1: Foundation
### Task 1: Foundation
**Blocked by:** None
- [x] Add the base.

### Slice 2: Current work
### Task 2: API
**Blocked by:** Task 1
- [ ] Add the API.
- [ ] Test the API.
### Task 3: Docs
**Blocked by:** Task 2
- [ ] Document the API.

### Slice 3: Later
### Task 4: Follow-up
**Blocked by:** Task 3
- [ ] Add follow-up.
`;

describe("selectExecutionUnit", () => {
  it("selects only incomplete tasks in the first incomplete slice", () => {
    const result = selectExecutionUnit(groupedPlan);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.unit, { heading: "Slice 2: Current work", taskNumbers: [2, 3] });
  });

  it("selects all remaining tasks in an ungrouped plan", () => {
    const result = selectExecutionUnit(`# Plan\n\n### Task 1: Done\n- [x] Finished.\n\n### Task 2: One\n- [ ] Do one.\n\n### Task 3: Two\n- [ ] Do two.\n`);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.unit, { heading: "All remaining plan tasks", taskNumbers: [2, 3] });
  });

  it("treats unheaded checklist items as one ungrouped task set", () => {
    const result = selectExecutionUnit("# Plan\n\n- [x] Done.\n- [ ] Do this.\n- [ ] Do that.\n");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.unit, { heading: "All remaining plan tasks", taskNumbers: [2, 3] });
  });

  it("refuses a missing prerequisite", () => {
    const plan = groupedPlan.replace("**Blocked by:** Task 1\n- [ ] Add the API.", "**Blocked by:** Task 9\n- [ ] Add the API.");
    const result = selectExecutionUnit(plan);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /blocked by missing Task 9/);
  });

  it("refuses a prerequisite that points to a later slice", () => {
    const plan = groupedPlan.replace("**Blocked by:** Task 1\n- [ ] Add the API.", "**Blocked by:** Task 4\n- [ ] Add the API.");
    const result = selectExecutionUnit(plan);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /future slice/);
  });

  it("refuses malformed or ambiguous task and slice headings", () => {
    for (const plan of [
      "# Plan\n\n### Slice two: Bad\n### Task 1: Work\n- [ ] Work.\n",
      "# Plan\n\n### Task 1: First\n- [ ] Work.\n### Task 1: Duplicate\n- [ ] More.\n",
      "# Plan\n\n### Task one: Bad\n- [ ] Work.\n",
    ]) {
      const result = selectExecutionUnit(plan);
      assert.equal(result.ok, false);
    }
  });

  it("refuses a plan with no remaining tasks or no task checkboxes", () => {
    assert.equal(selectExecutionUnit("# Plan\n\n### Task 1: Done\n- [x] Finished.\n").ok, false);
    assert.equal(selectExecutionUnit("# Plan\n\n### Task 1: Empty\nNo checkbox.\n").ok, false);
  });
});

describe("validatePlanProgress", () => {
  const unit = { heading: "Slice 2: Current work", taskNumbers: [2, 3] };

  it("requires the selected unit to complete and preserves all other task checkboxes", () => {
    const after = groupedPlan
      .replace("- [ ] Add the API.", "- [x] Add the API.")
      .replace("- [ ] Test the API.", "- [x] Test the API.")
      .replace("- [ ] Document the API.", "- [x] Document the API.");
    assert.equal(validatePlanProgress(groupedPlan, after, unit, "execute").ok, true);
    assert.equal(validatePlanProgress(groupedPlan, groupedPlan, unit, "execute").ok, false);
  });

  it("refuses changes to prior or later task checkboxes", () => {
    const changedLater = groupedPlan
      .replace("- [ ] Add the API.", "- [x] Add the API.")
      .replace("- [ ] Test the API.", "- [x] Test the API.")
      .replace("- [ ] Document the API.", "- [x] Document the API.")
      .replace("- [ ] Add follow-up.", "- [x] Add follow-up.");
    const result = validatePlanProgress(groupedPlan, changedLater, unit, "execute");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /out-of-unit/);
  });

  it("requires simplification to preserve the task checklist state", () => {
    const before = groupedPlan.replace("- [ ] Add the API.", "- [x] Add the API.");
    const after = before.replace("- [ ] Document the API.", "- [x] Document the API.");
    assert.equal(validatePlanProgress(before, after, unit, "simplify").ok, false);
    assert.equal(validatePlanProgress(before, before, unit, "simplify").ok, true);
  });

  it("lets recovery change only the selected unit's checkboxes", () => {
    const inUnit = groupedPlan.replace("- [ ] Add the API.", "- [x] Add the API.");
    assert.equal(validatePlanProgress(groupedPlan, inUnit, unit, "recovery").ok, true);
    assert.equal(validatePlanProgress(groupedPlan, groupedPlan, unit, "recovery").ok, true);
    const outOfUnit = groupedPlan.replace("- [ ] Add follow-up.", "- [x] Add follow-up.");
    const result = validatePlanProgress(groupedPlan, outOfUnit, unit, "recovery");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /out-of-unit/);
  });
});
