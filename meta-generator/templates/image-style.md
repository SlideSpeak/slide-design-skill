# __SKILL_NAME__ — Image Style

## AI-Generated (FAL.ai)

Prompt template: `{subject}, TODO style modifiers, no text, no logos, 16:9`

Negative prompt: stock business photography, generic clipart, cartoon, low contrast

## Stock Photography (Unsplash + Pexels federated)

Search-query template: `{subject} TODO style modifier`

License filter: CC0 / Unsplash-license / Pexels-license only.

## Decision Rules

- `gradient | background | abstract` → AI default
- `person | product | location` → ask user
- `concept | scene` → ask user

## Brand-Asset-Constraint (engine-enforced)

Reject any company-name, logo-name, trademark, or recognizable proprietary asset in image prompts.
