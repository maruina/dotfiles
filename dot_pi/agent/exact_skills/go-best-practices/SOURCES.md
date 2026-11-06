# Go guidance sources
## Source identity and precedence
- Ultimate Go Notebook, First Edition, Version 1.0, William Kennedy with Hoanh An (2021), Patch 39. Local PDF: 352 pages, 15,697,515 bytes; SHA-256 `12068570744faf03d4bf1e4c8880655e0baff281013a0c944a7b8d7505c66b13`. PDF pages 2–351 map to printed pages 1–350; front/back covers are unnumbered.
- [Uber Go Style Guide](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/style.md), revision `1d60a91aa5e87d443002e23c21903c49489dbde5`, [Apache-2.0](https://github.com/uber-go/guide/blob/1d60a91aa5e87d443002e23c21903c49489dbde5/LICENSE). Originally created by Prashant Varanasi and Simon Newton, expanded by contributors. The core skill condenses, reorganizes, and supplements that guide.
- Claude marketplace `atom/skills/go-best-practices/SKILL.md`, revision `b937ce451cf47154af8566b6ad7776a7749fc810`.
- Repository contracts and supported toolchains constrain application. Verified language semantics/API contracts override inaccurate source claims. Uber wins style conflicts with the marketplace and book. Escalate a genuine modern-design/Uber policy conflict.
- Store concise original guidance, attribution, and evidence only. Do not store the PDF, raw extraction, substantial excerpts, copied diagrams, or `VENDOR.md`.

## Coverage and verification
`plans/go-notebook-skill/coverage.md` tracks source disposition separately from shipped guidance. Reading a range is not verification. Version-sensitive claims require primary documentation and original tests where applicable; missing evidence leaves a claim blocked. A successful modern-toolchain test does not establish older-toolchain compatibility.

The existing core is the merged PR #125 baseline (`13d2330ff3bfc749e560ff382442b123f7eddcf7`). Book-derived rules are added only after bounded content review and the modernization gate.
