# Repository skills

Repository-specific Agent Skills live in one directory per skill:

```text
.agents/skills/<skill-name>/SKILL.md
```

Skills should encode repeatable workflows that require repository-specific
judgement. Ordinary commands belong in documentation or scripts, not in a skill.
No skill should duplicate the architectural rules in `AGENTS.md`.

Current skills:

- `microinteraction-design`: design, audit and verify complete interactive
  behaviour before implementation.
- `svelte-presentation-mvvm`: place Svelte presentation, state and commands at
  the correct boundary.
