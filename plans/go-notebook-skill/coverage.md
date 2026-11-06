# Go notebook source coverage
Ranges are printed / PDF pages. Shared boundary pages must be checked during content review. The initial ranges come from the TOC, not content review. Parent rows and nested rows can overlap.

## Ledger
Rule IDs refer to `dot_pi/agent/exact_skills/go-best-practices/SOURCES.md`. Each evidence entry records classification, date, version, and test commands where needed. `omit` is a completed scope exclusion, not an integrated rule.

| Section | Printed / PDF pages | Rule IDs | Destination | Disposition | Evidence / test | Status | Unresolved question |
|---|---|---|---|---|---|---|---|
| 1 Introduction | 10–24 / 11–25 | — | — | omit: philosophy/previews outside scope | Approved plan exclusion | omit | None |
| 2.1 Built-in Types | 25–25 / 26–26 | LM1 | references/ownership-and-memory.md / SOURCES.md | add | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.2 Word Size | 25–25 / 26–26 | LM1 | references/ownership-and-memory.md / SOURCES.md | add: portable widths; omit fixed word layouts | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.3 Zero Value Concept | 25–25 / 26–26 | LM1 | SKILL.md | already-covered: core nil/zero rules; omit bit-layout promise | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | already-covered | None |
| 2.4 Declare and Initialize | 26–26 / 27–27 | LM1 | SKILL.md | already-covered: core declarations and byte-oriented strings | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | already-covered | None |
| 2.5 Conversion vs Casting | 27–27 / 28–28 | LM1 | references/ownership-and-memory.md / SOURCES.md | add: conversion is not an allocation contract | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.6 Struct and Construction Mechanics | 27–28 / 28–29 | LM1 | SKILL.md | already-covered: keyed literals and zero-value declarations | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | already-covered | None |
| 2.7 Padding and Alignment | 29–30 / 30–31 | LM2 | references/ownership-and-memory.md / SOURCES.md | add: alignment requirements and measured layout | SOURCES.md LM2; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.8 Assigning Values | 31–31 / 32–32 | LM1 | references/ownership-and-memory.md / SOURCES.md | omit: assignment syntax lesson; defined-type distinction validated in evidence | SOURCES.md LM1; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | omit | None |
| 2.9 Pointers | 32–32 / 33–33 | LM3, LM4 | references/ownership-and-memory.md / SOURCES.md | add: sharing and lifetime; omit fixed stacks | SOURCES.md LM3, LM4; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.10 Pass By Value | 33–33 / 34–34 | LM3 | references/ownership-and-memory.md / SOURCES.md | add: copied pointers and shallow values | SOURCES.md LM3; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.11 Escape Analysis | 34–36 / 35–37 | LM4 | references/ownership-and-memory.md / SOURCES.md | add: safe lifetime without heap promises | SOURCES.md LM4; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.12 Stack Growth | 37–37 / 38–38 | LM4 | references/ownership-and-memory.md / SOURCES.md | omit: runtime stack mechanics and unconditional variable-size heap claim | SOURCES.md LM4; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | omit | None |
| 2.13 Garbage Collection | 37–37 / 38–38 | LM4 | references/ownership-and-memory.md / SOURCES.md | omit: pacing introduction; GC tuning deferred to Slice 11 | SOURCES.md LM4; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | omit | None |
| 2.14 Constants | 37–38 / 38–39 | LM5 | references/ownership-and-memory.md / SOURCES.md | add: constant precision and representability corrections | SOURCES.md LM5; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 2.15 IOTA | 39–40 / 40–41 | LM5 | references/ownership-and-memory.md / SOURCES.md | add: specification indexing; enum policy already in core | SOURCES.md LM5; checked 2026-11-06; Go 1.27.3 tests/vet and negative compilation checks where applicable | integrated | None |
| 3.1 CPU Caches | 41–43 / 42–44 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.2 Translation Lookaside Buffer (TLB) | 44–44 / 45–45 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.3 Declaring and Initializing Values | 45–45 / 46–46 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.4 String Assignments | 45–45 / 46–46 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.5 Iterating Over Collections | 46–46 / 47–47 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.6 Value Semantic Iteration | 46–47 / 47–48 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.7 Pointer Semantic Iteration | 48–48 / 49–49 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.8 Data Semantic Guideline For Built-In Types | 48–48 / 49–49 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.9 Different Type Arrays | 49–49 / 50–50 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.10 Contiguous Memory Construction | 49–49 / 50–50 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.11 Constructing Slices | 50–50 / 51–51 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.12 Slice Length vs Capacity | 50–50 / 51–51 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.13 Data Semantic Guideline For Slices | 51–51 / 52–52 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.14 Contiguous Memory Layout | 51–51 / 52–52 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.15 Appending With Slices | 52–53 / 53–54 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.16 Slicing Slices | 54–54 / 55–55 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.17 Mutations To The Backing Array | 55–58 / 56–59 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.18 Copying Slices Manually | 59–59 / 60–60 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.19 Slices Use Pointer Semantic Mutation | 60–60 / 61–61 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.20 Linear Traversal Efficiency | 61–61 / 62–62 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.21 UTF-8 | 62–63 / 63–64 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.22 Declaring And Constructing Maps | 64–64 / 65–65 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.23 Lookups and Deleting Map Keys | 65–65 / 66–66 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 3.24 Key Map Restrictions | 66–66 / 67–67 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.1 Methods | 67–67 / 68–68 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.2 Method Calls | 67–67 / 68–68 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.3 Data Semantic Guideline For Internal Types | 68–68 / 69–69 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.4 Data Semantic Guideline For Struct Types | 69–71 / 70–72 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.5 Methods Are Just Functions | 72–72 / 73–73 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.6 Know The Behavior of the Code | 73–75 / 74–76 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.7 Interfaces | 76–76 / 77–77 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.8 Interfaces Are Valueless | 77–77 / 78–78 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.9 Implementing Interfaces | 77–78 / 78–79 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.10 Polymorphism | 79–79 / 80–80 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.11 Method Set Rules | 80–81 / 81–82 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.12 Slice of Interface | 82–82 / 83–83 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.13 Embedding | 83–86 / 84–87 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 4.14 Exporting | 87–89 / 88–90 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.1 Grouping Different Types of Data | 90–93 / 91–94 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.2 Don’t Design With Interfaces | 94–94 / 95–95 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.3 Composition | 95–96 / 96–97 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.4 Decoupling With Interfaces | 97–99 / 98–100 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.5 Interface Composition | 100–100 / 101–101 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.6 Precision Review | 101–102 / 102–103 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.7 Implicit Interface Conversions | 103–103 / 104–104 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.8 Type assertions | 104–104 / 105–105 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.9 Interface Pollution | 105–106 / 106–107 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.10 Interface Ownership | 107–107 / 108–108 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.11 Error Handling | 108–113 / 109–114 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.12 Always Use The Error Interface | 114–114 / 115–115 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 5.13 Handling Errors | 115–118 / 116–119 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.1 Scheduler Semantics | 119–120 / 120–121 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.2 Concurrency Basics | 121–124 / 122–125 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.3 Preemptive Scheduler | 125–126 / 126–127 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.4 Data Races | 127–127 / 128–128 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.5 Data Race Example | 127–129 / 128–130 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.6 Race Detection | 130–131 / 131–132 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.7 Atomics | 132–132 / 133–133 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.8 Mutexes | 133–134 / 134–135 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.9 Read/Write Mutexes | 135–136 / 136–137 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.10 Channel Semantics | 137–138 / 138–139 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11 Channel Patterns | 139–139 / 140–140 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.1 Wait For Result | 139–139 / 140–140 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.2 Fan Out/In | 140–140 / 141–141 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.3 Wait For Task | 141–141 / 142–142 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.4 Pooling | 141–142 / 142–143 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.5 Drop | 143–144 / 144–145 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.6 Cancellation | 145–145 / 146–146 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.7 Fan Out/In Semaphore | 146–146 / 147–147 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.8 Bounded Work Pooling | 147–147 / 148–148 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.9 Retry Timeout | 148–148 / 149–149 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 6.11.10 Channel Cancellation | 149–150 / 150–151 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 7.1 Basic Unit Test | 151–152 / 152–153 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 7.2 Table Unit Test | 153–153 / 154–154 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 7.3 Web Call Mocking | 154–156 / 155–157 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 7.4 Internal Web Endpoints | 157–159 / 158–160 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 7.5 Basic Sub-Tests | 160–162 / 161–163 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 8.1 Basic Benchmark | 163–166 / 164–167 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 8.2 Basic Sub-Benchmarks | 167–167 / 168–168 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 8.3 Validate Benchmarks | 168–173 / 169–174 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.1 Basic Syntax | 174–175 / 175–176 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.2 Underlying Types | 176–177 / 177–178 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.3 Struct Types | 178–179 / 179–180 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.4 Behavior As Constraint | 180–181 / 181–182 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.5 Type As Constraint | 182–183 / 183–184 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.6 Multi-Type Parameters | 184–184 / 185–185 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.7 Field Access | 184–185 / 185–186 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.8 Slice Constraints | 186–188 / 187–189 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.9 Channels | 189–191 / 190–192 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 9.10 Hash Tables | 192–199 / 193–200 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.1 Introduction | 200–200 / 201–201 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.1.1 The Basics of Profiling | 200–200 / 201–201 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.1.2 Types of Profiling | 200–200 / 201–201 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.1.3 Hints to interpret what I see in the profile | 201–201 / 202–202 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.1.4 Rules of Performance | 202–202 / 203–203 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.1.5 Go and OS Tooling | 202–202 / 203–203 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.2 Example Code | 203–204 / 204–205 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 10.3 Benchmarking | 205–205 / 206–206 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.4 Memory Profiling | 206–209 / 207–210 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.5 Inlining | 210–211 / 211–212 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 10.6 Escape Analysis | 212–219 / 213–220 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 11.1 Example Code | 220–221 / 221–222 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 11.2 Generating a GC Trace | 222–222 / 223–223 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 11.3 Generating Load And Evaluation | 223–223 / 224–224 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 11.4 Adding Profile Endpoints | 224–226 / 225–227 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 11.5 Viewing Memory Profile | 227–229 / 228–230 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 11.6 Removing Allocations | 230–232 / 231–233 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 12.1 Example Code | 233–234 / 234–235 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 12.2 Generating Traces | 235–235 / 236–236 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 12.3 Viewing Traces | 236–240 / 237–241 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 12.4 Fan-Out | 241–243 / 242–244 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 12.5 Cache Friendly | 244–244 / 245–245 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 12.6 Fan-Out Results | 245–247 / 246–248 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 12.7 Pooling | 248–249 / 249–250 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 12.8 Pooling Results | 250–251 / 251–252 | — | — | omit: worked-example walkthrough (approved scope) | TOC navigation only; content not reviewed | omit | None |
| 12.9 GC Percentage | 252–253 / 253–254 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 12.10 Tasks And Regions | 254–257 / 255–258 | — | — | undecided | TOC navigation only; content not reviewed | pending | Review in chapter slice |
| 13 Stack Traces / Core Dumps | 258–265 / 259–266 | — | — | omit: historical ABI walkthrough | Approved plan exclusion | omit | None |
| 14 Blog Posts | 266–350 / 267–351 | — | — | omit: essay reprints overlap scoped chapters | Approved plan exclusion | omit | None |

## Slice 1 routing and validation
| Scenario | Expected loading | Inspection result |
|---|---|---|
| Pointer/value choice or shallow struct copy | Core + ownership reference | Explicit task match and existing link |
| Escape report, struct layout, constants or narrowing conversion | Core + ownership reference | Explicit task matches; LM1–LM5 evidence links |
| Source provenance check | Core + SOURCES.md | Explicit audit route |
| Simple error wrapping | Core only | Explicit no-topic-reference instruction |
| Concurrency design, generics, profiling, benchmarking | Core safeguards; no not-yet-created topic files | No links to missing future references |

Manual inspection checks routing text and link existence, not deterministic model compliance. No application runtime, service telemetry, or rollout experiment is involved. The source ledger and test evidence provide observability. Matteo owns rollout after independent verification; reverting the content commit rolls it back.

Validation: missing-file red checks returned 1; PDF hash matched; Go 1.27.3 example/mechanics tests, vet, and escape build passed; invalid constant and defined-type assignment failed as expected. The overflow diagnostic said “overflows” without the destination type; matched the actual diagnostic after inspecting it, without changing the expected rejection. Skill validators passed for shared/work/personal profiles. Source dependency install completed with scripts disabled.

## Resume
Chapter 2 review complete. Next content review: Chapter 3, printed 41–66 / PDF 42–67. Chapters 3–12 remain pending except approved walkthrough exclusions. Recheck the PDF hash from the plan before extraction. Front matter establishes edition and navigation only; PDF 352 is the blank back cover.
