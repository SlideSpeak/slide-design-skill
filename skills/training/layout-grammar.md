# Training — Layout Grammar

## Slide Types

| slide-type | when | required slots | optional slots |
|---|---|---|---|
| `cover` | first slide | `workshop-title`, `instructor-name`, `duration`, `audience-level` | `date`, `location` |
| `agenda` | second slide | `headline`, `module-1-title`, `module-1-duration`, `module-2-title`, `module-2-duration`, `module-3-title`, `module-3-duration` | `module-4-title`, `module-4-duration`, `module-5-title`, `module-5-duration` |
| `objectives` | learning outcomes | `headline`, `objective-1`, `objective-2`, `objective-3` | `objective-4`, `objective-5` |
| `module-intro` | start of each module | `module-number`, `module-title`, `why-this-matters` |  |
| `concept` | teaching one idea | `headline`, `concept-body`, `example-label`, `example-body` | `analogy` |
| `demonstration` | step-by-step | `headline`, `step-1`, `step-2`, `step-3`, `step-4` | `step-5`, `code-caption` |
| `exercise` | hands-on task | `headline`, `task`, `time-box`, `success-criteria` | `hint` |
| `debrief` | reflection | `headline`, `reflective-question`, `takeaway-1`, `takeaway-2` | `takeaway-3` |
| `resources` | links/reading | `headline`, `resource-1-name`, `resource-1-url`, `resource-2-name`, `resource-2-url`, `resource-3-name`, `resource-3-url` | `resource-4-name`, `resource-4-url` |
| `closing` | what next | `headline`, `next-action`, `support-channel`, `instructor-contact` |  |

## Composition Rules

- First slide is always `cover`. Last is always `closing`.
- Second is `agenda`, third is `objectives` (unless deck < 5 slides).
- Each module starts with `module-intro`, contains 1+ `concept`/`demonstration`, ends with `exercise` then `debrief`.
- `exercise` slides MUST have `time-box` filled — never an open-ended exercise.
- `resources` appears once, between final `debrief` and `closing`.
- Color rule: `exercise` slides use the orange highlight (#EA580C) for the time-box pill; no other slide does.
