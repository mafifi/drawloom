# Sources and adaptation decisions

Inspected 2026-09-12. These public MIT-licensed skills informed the design lens;
their implementation recipes were not copied into Drawloom.

| Source | Inspected revision | Retained idea | Drawloom decision |
| --- | --- | --- | --- |
| [Wondel Microinteractions](https://github.com/wondelai/skills/tree/c172996495bed0fcd26896a9416b2093fd7073f0/microinteractions) | `c172996495bed0fcd26896a9416b2093fd7073f0` | Trigger, Rules, Feedback, Loops and Modes; discoverability; signature moments; repeated use | Primary product-design grammar, expressed through Drawloom ownership and verification boundaries |
| [solinkz micro-interactions-skill](https://github.com/solinkz/micro-interactions-skill/tree/3796c3e5c2762989b6ff4d761b88224c6a94b418) | `3796c3e5c2762989b6ff4d761b88224c6a94b418` | Input modalities, state coverage, interruption, performance and audit prompts | Selected checks only; no universal framework or dependency recommendations adopted |
| [Dembrandt micro-interactions](https://github.com/dembrandt/dembrandt-skills/blob/5613c26e6dfbc061cf623126e28ec76880251995/skills/micro-interactions/SKILL.md) | `5613c26e6dfbc061cf623126e28ec76880251995` | Natural-world weight, restraint, layout stability and remote-change feedback | Inspiration only; rejected universal motion, duration, scaling and blanket reduced-motion rules |

Dan Saffer's four-part model is credited by the inspected Wondel and solinkz
skills. Drawloom's brief adds its own MVVM ownership, public/private boundary,
truthfulness, reduced-motion and verification requirements.
