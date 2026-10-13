# Project templates

[Format index](Intro.md) · [Public API](api.md)

A template is plain YAML under `templates/<id>/template.yaml`. It declares `id`, semantic `version`, required `format`, `title`, `description`, `architectureSkill`, profile `blocks` and optional partial `lifecycleOverrides`. Every block has an ID/title/help and questions with ID, question, type and help. Optional fields include why, required, example, choices and free-text permission. Unknown keys survive.

Question types are short-text, long-text, single-choice, multiple-choice and list. Choice questions require unique options with value/label. Answers are text or lists of text; null means unanswered. Required manual-intake answers cannot be missing; inferred intake permits an unresolved null with a source rather than inventing a value. Free-text permission allows other choice values. Duplicate block/question IDs, incompatible formats, invalid examples and lifecycle overrides that lose required gates are rejected. Broken templates are reported with their path/field and excluded from the catalog.

`initializeProject` validates the complete profile and optional Feature Bootstrap in a temporary sibling project, then renames its `.voidra/` into place. Existing planning directories are refused; other project files are preserved. Inferred intake requires a source for every answer; the existing-code helper explicitly creates no Bootstrap. Confirmed answer changes create a draft Profile change with old/new JSON values and a link to its block. Confirmation of an inferred answer records actor/time without creating a change draft.

General 1.0.0 has nine blocks and seventeen questions, with delegated approval recorded in the general review. Its architecture skill proposes Discovery rounds, plans with seams/ADR proposals and linked slices, stopping at gates. The new-project fixture comes from actual template initialization. Architecture dispatch and executing lifecycle overrides arrive in P08; general overrides are empty. The app and standalone intake bundle the workspace helpers, while the published 0.1.0 CLI remains the baseline validator until a later package release.
