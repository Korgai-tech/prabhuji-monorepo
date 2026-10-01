# content-agent-retrieval

Builds, inspects and tests the RAGFlow agent behind **content chat**
(`content_chat` variant). Python 3 standard library only; it reuses the
transport in `../companion-agent/companion.py`.

## Why it exists (TAM-263)

The old content agent, `Prabhuji-Chat-Fixed` (`f75b8dac…`), had content search
as an *optional* tool. In about 1 of 4 content answers gpt-4o skipped it and
invented ids (`art_1234 art_5678 art_9101`), so users got no card, or an
unrelated one. More prompt wording did not stop it.

This tool builds a **copy** of that agent where search is a fixed step:

| Step | Component | What it does |
| --- | --- | --- |
| 1 | `Agent:SearchQueryWriter` | Turns the conversation into one line of search words |
| 2 | `Retrieval:AlwaysSearch` | Searches Prabhuji-content (top 12) with those words |
| 3 | `Agent:CozyShrimpsDoubt` | Answers, choosing ids only from the RESULTS block |

Production serves that copy: `Prabhuji-Chat-Fixed-always-retrieve`
(`4c858abeb8a711f1976b35098b15915b`, `CONTENT_AGENT` in
`apps/api/src/core/chat/services/chat.constants.ts`). The old agent is left
untouched as the rollback.

## Setup

```
export RAGFLOW_BASE_URL=https://ragflow-f7pq.onrender.com
export RAGFLOW_API_KEY=…   # from Secrets Manager app-prod-api-env (prod, ap-south-1)
```

Or put both in the monorepo `.env` (gitignored). Nothing here prints the key.

## Commands

| Command | What it does | Changes RAGFlow? |
| --- | --- | --- |
| `inspect [--agent ID]` | Model, token settings, wiring, and whether both prompt copies match. Defaults to the live agent | No |
| `test --agent ID [-v]` | 11 conversations (Hanuman Chalisa, life situation, follow-up, horoscope, declines, wallpaper, ask for more, …). Fails on invented or unknown ids, wrong deity, missing JSON keys, code fences | No (opens test sessions) |
| `measure` | Token cost of the search results at 4/6/8/12 items | No |
| `build [--dsl-file F]` | Writes the new DSL to `content_agent_dsl.json` for review | No |
| `create [--title T]` | Builds from the old agent and creates a NEW agent | Creates an agent |
| `update --agent COPY_ID` | Rebuilds and overwrites a copy. Refuses the old agent's id | Overwrites that copy |

Options on `build`/`create`/`update`: `--top-n N` (default 6 for `build`; production runs 12), `--no-tool` (remove the refined-search tool).

## Changing the content agent

1. Edit the prompt text in `fix_content_agent.py` (`CONTENT_SECTION`, `QUERY_WRITER_PROMPT`, …).
2. `create --top-n 12`, or `update --agent <your copy> --top-n 12`.
3. `test --agent <copy>` **three times**; answers vary between runs.
4. Point `CONTENT_AGENT` at the copy, open a PR to `stage`, check it there, then `main`.
   Open conversations move to the new agent on their next message (TAM-264).

Never edit the production agent in place first. A RAGFlow UI save rebuilds the
agent from its `graph` copy of the prompt, and `components` holds the other
copy; this tool writes both and `inspect` checks they match.

## Known traps

| Symptom | Cause |
| --- | --- |
| "LLM user message is empty after prompt fitting" | The model's context limit in RAGFlow (`tenant_model.extra.max_tokens`) is below prompt + results. gpt-4o was 8,192; now 128,000 |
| JSON keys missing, `hor_simha` | Same limit: RAGFlow silently cut the end of the system prompt |
| Timeouts / connection resets | The Render instance is slow under load; calls retry 3 times |
