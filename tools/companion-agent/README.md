# experiment-companion

A basic conversational companion agent on RAGFlow, plus the CLI that created it
and talks to it.

```
python3 companion.py probe              # list the agents on the deployment
python3 companion.py create             # push companion_dsl.json as a new agent
python3 companion.py ask "namaste"      # one-shot, for smoke tests
python3 companion.py chat               # interactive multi-turn session
```

Python 3 standard library only. Nothing to install.

**Live agent id:** `ce8caeb4a82311f18e582d93545b9663` (created 2026-09-04)

## Credentials

Read from `RAGFLOW_BASE_URL` / `RAGFLOW_API_KEY` in the environment, falling
back to `prabhuji-monorepo/.env` — the same two keys the api declares in
`apps/api/src/shared/config/env.ts`. No new secrets, and nothing here prints
the key.

## The agent

Three nodes: `begin` (conversational, with a prologue) → `Agent:Companion` →
`Message:Companion`. No retrieval, no tools, no structured output.

`companion_dsl.json` was derived from the checked-in `Prabhuji Chat - V2.json`
canvas export rather than written from the published DSL docs, because the
docs describe a different schema version than this deployment runs. Four
values differ from that parent canvas, all deliberate:

| Setting | Companion | Parent | Why |
| --- | --- | --- | --- |
| `tools`, `mcp` | `[]` | Retrieval tool | Plain persona, no knowledge base |
| `showStructuredOutput` | `false` | `true` | Returns prose, not a JSON schema |
| `message_history_window_size` | 12 | 6 | Multi-turn memory is the point |
| `temperature` | 0.7 | 0.1 | 0.1 suits retrieval; a companion at 0.1 is wooden |

`llm_id` is `gpt-4o@Embedding@Azure-OpenAI`, copied verbatim from the parent
canvas. The `Embedding` in the middle of a chat model name is odd but it is
what this deployment uses, and it is confirmed working.

To change the agent's behaviour, edit `companion_dsl.json` and create a new
agent. There is no update path here: `PUT /api/v1/agents/{id}` exists in the
API but this tool does not use it, so the live agent and this file can drift.
Re-create rather than editing the canvas in the RAGFlow UI if you want the two
to stay in step.

## Sessions are not optional

`converse()` always opens a session first, via
`POST /api/v1/agents/{id}/sessions`, and reuses its id for every turn.

This is the one non-obvious thing about the API. Without a `session_id`:

- the agent answers every message as a stranger, with no memory of the turn
  before;
- the `messages` array is **ignored** apart from its last entry, so replaying
  the conversation history client-side does not work either (visible as a
  `prompt_tokens` of ~6 no matter how much history you send);
- the response carries no `session_id` to pick up and reuse.

The result looks like a prompt problem — a companion that keeps forgetting
your name — but it is a missing session.

## Deployment quirks this tool works around

Both verified against the live deployment on 2026-09-04, and both differ from
`ragflow.io/docs/http_api_reference`:

- `GET /api/v1/agents` returns `{"data": {"canvas": [...], "total": n}}`, not
  the documented bare array, and ignores the `id` and `title` query filters.
  Filtering happens client-side.
- `page_size` is capped. Above 100 the response is `code: 0` with `data: null`
  — a silent empty listing rather than an error.
- The listing carries no `dsl`, so an existing agent's canvas cannot be read
  back through it. That is why the DSL here came from a file export.

## Safety

The system prompt tells the agent to take distress seriously and, if someone
describes being in danger or wanting to harm themselves, to say it is worried
and point them to a trusted person or a local helpline.

That is prompt text and nothing more. It is **not** connected to
`apps/api/src/core/chat/services/crisis-detection.service.ts`, which is what
actually guards RAGFlow-served chat in the product. Anything user-facing
should go through the api, not through this tool.
