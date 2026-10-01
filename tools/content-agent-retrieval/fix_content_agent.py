#!/usr/bin/env python3
"""Rewire the Prabhuji content agent so retrieval always runs before the model.

The content chat agent (Prabhuji-Chat-Fixed) had retrieval only as an optional
tool. In ~1 of 4 content answers gpt-4o skipped the tool and invented ids
(art_1234 art_5678 art_9101). This builds a COPY of that agent where a
Retrieval component runs on every turn, and its results are injected into the
Agent's user prompt as the only content that exists this turn.

    python3 fix_content_agent.py build --dsl-file export.json   # offline, writes the new DSL for review
    python3 fix_content_agent.py create                         # fetch live DSL, create the copy
    python3 fix_content_agent.py measure                        # token cost of RESULTS per top_n
    python3 fix_content_agent.py update --agent <copy_id>       # rebuild the copy in place
    python3 fix_content_agent.py test --agent <new_agent_id>    # run the acceptance checklist

The source agent is never modified. Pointing content_chat at a new copy is a
separate step: change CONTENT_AGENT in apps/api/.../chat.constants.ts. See
README.md next to this file.

Credentials: RAGFLOW_BASE_URL / RAGFLOW_API_KEY, via companion.py's loader.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import time
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "companion-agent"))
import companion  # noqa: E402  (call, open_session, converse, list_agents)

# The pre-fix content agent (Prabhuji-Chat-Fixed). Every build starts from its
# DSL, and it stays untouched as the rollback target.
SOURCE_AGENT_ID = "f75b8dac9a1211f18455bf94535108a7"
# What content_chat serves in production since TAM-263 (chat.constants.ts
# CONTENT_AGENT): the always-retrieve agent this tool built.
LIVE_AGENT_ID = "4c858abeb8a711f1976b35098b15915b"
NEW_TITLE = "Prabhuji-Chat-Fixed-always-retrieve"
AGENT = "Agent:CozyShrimpsDoubt"
BEGIN = "begin"
RETRIEVAL = "Retrieval:AlwaysSearch"
QUERY = "Agent:SearchQueryWriter"
ID_MAP = HERE.parents[1] / "apps/api/src/core/chat/assets/content-id-map.json"
OUT = HERE / "content_agent_dsl.json"

USER_PROMPT = """{sys.query}

---
RESULTS - the app already searched the content library for this conversation.
These are the only content items that exist for you this turn:

{%s@formalized_content}
---""" % RETRIEVAL

EMPTY_RESPONSE = "(no results)"

# The always-on search used to run on the user's literal words. "koi aur suna
# do" says nothing about Hanuman, so RESULTS came back off-topic and gpt-4o
# picked from it anyway (a Ganesha item sold as "Hanuman ji ka aur bhajan"),
# whatever the main prompt said. This step writes the search query from the
# conversation, so RESULTS is on-topic before the main Agent ever sees it.
QUERY_WRITER_PROMPT = """You write ONE search query for a Hindu devotional content library.
Output only the query: a single line of plain words. No quotes, no labels, no
explanation, no JSON.

Use the earlier turns to understand what the latest message refers to.
- Always include the deity if the user named one, or if the conversation is
  already about one. Use the deity names below.
- Include the content types the user wants: mantra, aarti, bhajan, chalisa,
  stotram, ringtone, wallpaper, status. If they described a life situation
  and named no type, write "mantra aarti bhajan".
- Include tag words from TAG_VOCABULARY that fit the situation, feeling and
  need.
- For "aur koi", "kuch aur", "koi aur suna do" and similar: repeat the deity
  and type from the earlier turns.
- If the message is a thank-you, a greeting, gibberish, or about health,
  court cases or money decisions, just output the message as it is.

Examples:
  "Hanuman chalisa do" -> hanuman chalisa aarti bhajan
  (after a Hanuman Chalisa) "koi aur suna do" -> hanuman aarti bhajan mantra chalisa
  (after Durga bhajans) "konsa mantra?" -> durga mantra jaap
  "Aaj mann bahut pareshan hai" -> stress anxiety peace_seeking peace_of_mind mantra aarti bhajan
  "Meri job nahi lag rahi" -> job_search anxiety success confidence obstacle_removal mantra aarti bhajan
  "hanuman wallpaper dikhao" -> hanuman wallpaper

{vocab}
"""

# Replaces everything from "# YOUR TOOL" up to "# TAG_VOCABULARY".
CONTENT_SECTION_WITH_TOOL_TAIL = """
## Refined search (optional, at most once)

If the user wants content and nothing in RESULTS fits, you may call the
retrieval tool ONCE with a better query. Build that query from tag words in
TAG_VOCABULARY plus the deity and the content types:
  "kaam mein bahut dikkat aa rahi hai"
    -> work_trouble stress strength courage hanuman mantra aarti bhajan
  "paison ki tension hai"
    -> money_shortage debt anxiety prosperity lakshmi mantra aarti bhajan
  "hanuman wallpaper dikhao"
    -> hanuman wallpaper
Ids from that search count exactly like ids in RESULTS. Ids from nowhere do
not exist.

RESULTS is searched with a query written from the whole conversation, so for
follow-ups it is normally already about the right deity. Still check the
deity field of every item before you return it. If RESULTS has nothing of the
right deity, run the refined search; if that has nothing either, return
content_ids: null. In particular:
  - The user asks for more ("aur koi", "kuch aur", "koi aur suna do"): search
    for the SAME deity and type you suggested before, then drop every id
    already shown. Never switch deity to fill the reply.
    "koi aur suna do" after a Hanuman Chalisa -> hanuman chalisa aarti bhajan
  - The user names a type for the deity already on screen ("konsa mantra?",
    "aarti bhi hai?"): search for that deity plus that type. If it returns
    nothing for that deity, say so in one line and return content_ids: null.
    Do not introduce a different deity, and never recommend a mantra, aarti
    or jaap that you are not returning as content.

Never mention searching, results or the library in reply_text.
"""

CONTENT_SECTION = """# YOUR CONTENT LIST

Before you see the message, the app has already searched the content library
for this conversation. The results are in the RESULTS block at the end of the user's
message. RESULTS is the ONLY list of content that exists for you this turn.

Wherever these instructions say "the search", "search results" or "what the
search returned", they mean RESULTS{tool_clause}. Wherever they say "do not
search", they mean: ignore RESULTS and return content_ids: null.

RESULTS is filled on every turn, including follow-ups, thank-yous and hard
stops. Its presence is NEVER a reason to suggest content. The rules below
(hard stops, WHEN TO SUGGEST CONTENT, FOLLOW-UP QUESTIONS) still decide
whether you return ids at all.

Each result carries: content_id, title, content_type, deity, duration_sec,
recommended_jaap_count, one_line_purpose, and its tag columns.

## Choosing from RESULTS

- Choose content ids ONLY from RESULTS. Copy each id character-for-character.
  If nothing there fits, return content_ids: null.
- If RESULTS says {empty}, nothing was found. Return content_ids: null.
- Never construct an id. If you find yourself choosing digits, you are
  inventing, and you must return null instead.
- The prefix is NOT the content type. Both aartis and bhajans carry art_ ids.
  Read the content_type field on the result. If the user asked for a bhajan,
  return items whose content_type is bhajan, not every art_ id in RESULTS.
- Every result carries a deity field. Results are ranked by text match, so a
  result can match the situation perfectly and still be the wrong deity.
  Check it.
- The only ids you may return that are not in RESULTS are the twelve hor_
  codes listed under "Horoscope / rashifal".

## When to ignore RESULTS completely (content_ids: null)

- Any earlier reply of yours has a [SUGGESTED: ...] line and the user has not
  asked for something new.
- The user is asking about something you already suggested this session.
- The question is a follow-up that needs an explanation, not new content.
- The message hit a hard stop above.
- The message is gibberish, abusive, or shows distress.
{tool_tail}
"""


# --------------------------------------------------------------------------
# DSL transform
# --------------------------------------------------------------------------

def patch_sys_prompt(prompt: str, keep_tool: bool) -> str:
    start = prompt.index("# YOUR TOOL")
    end = prompt.index("# TAG_VOCABULARY")
    section = CONTENT_SECTION.format(
        tool_clause=", plus any refined search you ran this turn" if keep_tool else "",
        empty=EMPTY_RESPONSE,
        tool_tail=CONTENT_SECTION_WITH_TOOL_TAIL if keep_tool else "",
    )
    prompt = prompt[:start] + section.strip() + "\n\n" + prompt[end:]
    # "2. Search the content library" in YOUR JOB now reads as choosing.
    prompt = prompt.replace(
        "2. Search the content library to find matching items.",
        "2. Look at the content the app found for you (RESULTS).",
    )
    return prompt


def query_writer_params(agent: dict[str, Any], sys_prompt: str) -> dict[str, Any]:
    """A tool-less Agent on the same model as the main one, so it needs no new
    provider setup. Short output, deterministic."""
    start = sys_prompt.index("# TAG_VOCABULARY")
    end = sys_prompt.index("# LANGUAGE")
    params = copy.deepcopy(agent)
    params.update({
        "sys_prompt": QUERY_WRITER_PROMPT.format(vocab=sys_prompt[start:end].strip()),
        "prompts": [{"role": "user", "content": "{sys.query}"}],
        "tools": [], "mcp": [],
        "temperature": 0.0, "temperatureEnabled": True,
        "max_rounds": 1, "cite": False,
        "maxTokensEnabled": False, "max_tokens": 4096,
        "showStructuredOutput": False,
        "description": "Writes the always-on search query from the conversation.",
    })
    return params


def retrieval_params(tool_params: dict[str, Any]) -> dict[str, Any]:
    """The always-on component takes the tool's own settings (dataset, top_n
    12, similarity 0.2, keyword weight) so results match what searches that
    did run returned; only the query source differs."""
    keep = ("cross_languages", "dataset_ids", "kb_ids", "keywords_similarity_weight",
            "meta_data_filter", "rerank_id", "retrieval_from", "similarity_threshold",
            "toc_enhance", "top_k", "top_n", "use_kg")
    params = {k: copy.deepcopy(tool_params[k]) for k in keep if k in tool_params}
    params["query"] = f"{QUERY}@content"
    params["empty_response"] = EMPTY_RESPONSE
    params["outputs"] = {
        "formalized_content": {"type": "string", "value": None},
        "json": {"type": "Array<Object>", "value": None},
    }
    return params


def transform(dsl: dict[str, Any], keep_tool: bool, top_n: int) -> dict[str, Any]:
    dsl = copy.deepcopy(dsl)
    comps = dsl["components"]
    if RETRIEVAL in comps:
        sys.exit(f"error: DSL already has {RETRIEVAL}; refusing to apply twice")
    agent = comps[AGENT]["obj"]["params"]
    tools = agent.get("tools") or []
    tool = next((t for t in tools if t.get("component_name") == "Retrieval"), None)
    if tool is None:
        sys.exit("error: the Agent has no Retrieval tool to take settings from")
    params = retrieval_params(tool["params"])
    # The system prompt alone is ~9.3k tokens. RAGFlow fits messages into the
    # model's configured context budget and, when the user message is the
    # bigger share of the overflow, truncates IT - to empty, failing with
    # "LLM user message is empty after prompt fitting". top_n 12 overflowed.
    params["top_n"] = top_n
    if not params.get("dataset_ids") and not params.get("kb_ids"):
        sys.exit("error: the Retrieval tool has no dataset_ids; not guessing one")

    new_sys_prompt = patch_sys_prompt(agent["sys_prompt"], keep_tool)
    new_prompts = [{"role": "user", "content": USER_PROMPT}]
    qparams = query_writer_params(agent, agent["sys_prompt"])

    # ---- execution view -------------------------------------------------
    comps[QUERY] = {
        "obj": {"component_name": "Agent", "params": qparams},
        "downstream": [RETRIEVAL],
        "upstream": [BEGIN],
    }
    comps[RETRIEVAL] = {
        "obj": {"component_name": "Retrieval", "params": params},
        "downstream": [AGENT],
        "upstream": [QUERY],
    }
    comps[BEGIN]["downstream"] = [QUERY]
    comps[AGENT]["upstream"] = [RETRIEVAL]
    agent["sys_prompt"] = new_sys_prompt
    agent["prompts"] = new_prompts
    agent["cite"] = True  # every answer carries its references, for auditing
    if not keep_tool:
        agent["tools"] = [t for t in tools if t is not tool]

    # ---- UI view (see memory: the two copies are never reconciled) ------
    graph = dsl["graph"]
    nodes = {n["id"]: n for n in graph["nodes"]}
    agent_node = nodes[AGENT]
    form = agent_node["data"]["form"]
    form["sys_prompt"] = new_sys_prompt
    form["prompts"] = copy.deepcopy(new_prompts)
    form["cite"] = True
    if not keep_tool:
        form["tools"] = [t for t in form.get("tools", []) if t.get("component_name") != "Retrieval"]
        tool_nodes = {e["target"] for e in graph["edges"]
                      if e["source"] == AGENT and e.get("sourceHandle") == "tool"}
        graph["nodes"] = [n for n in graph["nodes"] if n["id"] not in tool_nodes]
        graph["edges"] = [e for e in graph["edges"] if e["target"] not in tool_nodes]

    begin_pos = nodes[BEGIN]["position"]
    agent_pos = agent_node["position"]
    qform = {k: copy.deepcopy(v) for k, v in qparams.items() if k in form or k in ("tools", "mcp")}
    graph["nodes"].append({
        "id": QUERY,
        "type": "agentNode",
        "position": {"x": begin_pos["x"] + 60, "y": agent_pos["y"] - 300},
        "sourcePosition": "right",
        "targetPosition": "left",
        "selected": False,
        "data": {"label": "Agent", "name": "Search query writer", "form": qform},
    })
    graph["nodes"].append({
        "id": RETRIEVAL,
        "type": "retrievalNode",
        "position": {"x": (begin_pos["x"] + agent_pos["x"]) / 2, "y": agent_pos["y"] - 150},
        "sourcePosition": "right",
        "targetPosition": "left",
        "selected": False,
        "data": {"label": "Retrieval", "name": "Always search content",
                 "form": copy.deepcopy(params)},
    })
    graph["edges"] = [e for e in graph["edges"]
                      if not (e["source"] == BEGIN and e["target"] == AGENT)]
    for src, dst in ((BEGIN, QUERY), (QUERY, RETRIEVAL), (RETRIEVAL, AGENT)):
        graph["edges"].append({
            "id": f"xy-edge__{src}start-{dst}end",
            "source": src, "sourceHandle": "start",
            "target": dst, "targetHandle": "end",
            "data": {"isHovered": False},
        })

    # A new agent should not inherit the source's run state.
    for k in ("history", "messages", "path", "retrieval"):
        if k in dsl:
            dsl[k] = []
    return dsl


def check_consistency(dsl: dict[str, Any]) -> list[str]:
    """Both prompt copies must agree, and the wiring must be
    begin -> query writer -> Retrieval -> Agent."""
    problems = []
    c = dsl["components"]
    form = next(n for n in dsl["graph"]["nodes"] if n["id"] == AGENT)["data"]["form"]
    if c[AGENT]["obj"]["params"]["sys_prompt"] != form["sys_prompt"]:
        problems.append("sys_prompt differs between components and graph")
    if c[AGENT]["obj"]["params"]["prompts"] != form["prompts"]:
        problems.append("prompts differ between components and graph")
    chain = [(BEGIN, QUERY), (QUERY, RETRIEVAL), (RETRIEVAL, AGENT)]
    if any(c[a]["downstream"] != [b] or c[b]["upstream"] != [a] for a, b in chain):
        problems.append("components wiring is not begin -> query writer -> Retrieval -> Agent")
    edges = {(e["source"], e["target"]) for e in dsl["graph"]["edges"]}
    if any(e not in edges for e in chain) or (BEGIN, AGENT) in edges or (BEGIN, RETRIEVAL) in edges:
        problems.append("graph edges are not begin -> query writer -> Retrieval -> Agent")
    if c[RETRIEVAL]["obj"]["params"]["query"] != f"{QUERY}@content":
        problems.append("Retrieval does not read the query writer's output")
    if "# YOUR TOOL" in c[AGENT]["obj"]["params"]["sys_prompt"]:
        problems.append("old '# YOUR TOOL' section still present")
    return problems


# --------------------------------------------------------------------------
# RAGFlow I/O
# --------------------------------------------------------------------------

def retry(fn, *a, attempts: int = 3, **kw):
    """The Render-hosted instance drops connections under load (seen as
    ConnectionResetError mid-read). Retry those; HTTP errors still exit."""
    for i in range(attempts):
        try:
            return fn(*a, **kw)
        except (ConnectionError, TimeoutError) as e:
            if i == attempts - 1:
                raise
            print(f"  (connection dropped: {e!r}; retrying in {5 * (i + 1)}s)", file=sys.stderr)
            time.sleep(5 * (i + 1))


def _try_call(method: str, path: str) -> dict[str, Any] | None:
    try:
        return retry(companion.call, method, path)
    except SystemExit:
        return None


def fetch_live_dsl(agent_id: str) -> dict[str, Any]:
    """This deployment's listing omits dsl (see companion README), so try the
    single-agent endpoint first, then the listing in case a newer build
    carries it. Never fall back to a stale local export silently."""
    res = _try_call("GET", f"/api/v1/agents/{agent_id}")
    data = (res or {}).get("data")
    if isinstance(data, list):
        data = next((a for a in data if a.get("id") == agent_id), None)
    if isinstance(data, dict) and isinstance(data.get("dsl"), dict):
        return data["dsl"]
    for a in companion.list_agents():
        if a.get("id") == agent_id and isinstance(a.get("dsl"), dict):
            return a["dsl"]
    sys.exit(
        "error: could not read the live agent's DSL through the API.\n"
        "       Export Prabhuji-Chat-Fixed from the RAGFlow UI and re-run with\n"
        "       --dsl-file <export.json>."
    )


def load_dsl_file(path: str) -> dict[str, Any]:
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return d.get("dsl", d)


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def build(args: argparse.Namespace) -> dict[str, Any]:
    base = load_dsl_file(args.dsl_file) if args.dsl_file else fetch_live_dsl(SOURCE_AGENT_ID)
    dsl = transform(base, keep_tool=not args.no_tool, top_n=args.top_n)
    problems = check_consistency(dsl)
    if problems:
        sys.exit("error: transformed DSL is inconsistent:\n  " + "\n  ".join(problems))
    OUT.write_text(json.dumps(dsl, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT.relative_to(HERE.parents[1])}")
    return dsl


def cmd_build(args: argparse.Namespace) -> None:
    build(args)


def cmd_create(args: argparse.Namespace) -> None:
    title = args.title
    if any(a.get("title") == title for a in companion.list_agents()):
        sys.exit(f"error: an agent titled {title!r} already exists; pass --title")
    dsl = build(args)
    companion.call("POST", "/api/v1/agents", {
        "title": title,
        "description": "Copy of Prabhuji-Chat-Fixed with retrieval always run before the Agent. "
                       "Created by tools/content-agent-retrieval.",
        "dsl": dsl,
    })
    agent_id = next((a["id"] for a in companion.list_agents() if a.get("title") == title), None)
    if not agent_id:
        sys.exit("error: create reported success but the agent is not in the listing")
    print(f"created {title!r}\nagent_id: {agent_id}")


def cmd_update(args: argparse.Namespace) -> None:
    """Rebuild from the live SOURCE agent and overwrite the COPY. Refuses to
    touch the source. A PUT carrying only dsl is silently ignored by this
    deployment, so the title rides along."""
    if args.agent == SOURCE_AGENT_ID:
        sys.exit("error: refusing to overwrite the live source agent")
    agent = next((a for a in companion.list_agents() if a.get("id") == args.agent), None)
    if agent is None:
        sys.exit(f"error: no agent {args.agent} on this deployment")
    dsl = build(args)
    retry(companion.call, "PUT", f"/api/v1/agents/{args.agent}",
          {"title": agent["title"], "dsl": dsl})
    print(f"updated {agent['title']!r} ({args.agent}) with top_n={args.top_n}, "
          f"tool={'removed' if args.no_tool else 'kept'}")


def _tokens(text: str) -> int:
    try:
        import tiktoken
        return len(tiktoken.get_encoding("o200k_base").encode(text))
    except ImportError:
        return len(text) // 4


MEASURE_QUERIES = ["Hanuman chalisa do", "Aaj mann bahut pareshan hai",
                   "Meri job nahi lag rahi", "Hanuman ji ka wallpaper dikhao"]


def retrieve_ids(tool: dict[str, Any], question: str, page_size: int = 30) -> list[str]:
    """Content ids the knowledge base returns for `question`, with the agent's
    own dataset and thresholds."""
    res = retry(companion.call, "POST", "/api/v1/retrieval", {
        "question": question,
        "dataset_ids": tool.get("dataset_ids") or tool.get("kb_ids"),
        "similarity_threshold": tool.get("similarity_threshold", 0.2),
        "vector_similarity_weight": 1 - tool.get("keywords_similarity_weight", 0.3),
        "top_k": tool.get("top_k", 1024),
        "page_size": page_size,
    })
    chunks = ((res.get("data") or {}).get("chunks")) or []
    return [m.group(0) for c in chunks
            for m in re.finditer(r"\b(mnt|art|rng|wal|sts)_\d{4}\b", c.get("content") or "")]


_DEITY_CACHE: dict[str, str | None] = {}


def item_deity(dataset_id: str, content_id: str) -> str | None:
    """The deity recorded on a catalogue item, read from its KB document
    (documents are named like batch_029/wal_0283.md). None if not found."""
    if content_id in _DEITY_CACHE:
        return _DEITY_CACHE[content_id]
    deity = None
    try:
        deity = _lookup_deity(dataset_id, content_id)
    except (ConnectionError, TimeoutError, SystemExit) as e:
        print(f"  (deity lookup for {content_id} failed: {e!r}; skipping that check)", file=sys.stderr)
    _DEITY_CACHE[content_id] = deity
    return deity


def _lookup_deity(dataset_id: str, content_id: str) -> str | None:
    deity = None
    docs = (retry(companion.call, "GET",
                  f"/api/v1/datasets/{dataset_id}/documents?keywords={content_id}&page_size=5")
            .get("data") or {}).get("docs") or []
    doc = next((d for d in docs if content_id in (d.get("name") or "")), None)
    if doc:
        chunks = (retry(companion.call, "GET",
                        f"/api/v1/datasets/{dataset_id}/documents/{doc['id']}/chunks?page_size=5")
                  .get("data") or {}).get("chunks") or []
        text = " ".join(c.get("content") or "" for c in chunks)
        m = re.search(r"deity\W{0,4}([a-z_]+)", text, re.I)
        deity = m.group(1).lower() if m else None
    return deity


def source_tool_params() -> dict[str, Any]:
    agent = fetch_live_dsl(SOURCE_AGENT_ID)["components"][AGENT]["obj"]["params"]
    return next(t for t in agent["tools"] if t.get("component_name") == "Retrieval")["params"]


def cmd_measure(args: argparse.Namespace) -> None:
    """How many tokens the RESULTS block costs per top_n, using the same
    dataset and thresholds as the Retrieval component."""
    base = load_dsl_file(args.dsl_file) if args.dsl_file else fetch_live_dsl(SOURCE_AGENT_ID)
    agent = base["components"][AGENT]["obj"]["params"]
    tool = next(t for t in agent["tools"] if t.get("component_name") == "Retrieval")["params"]
    print(f"system prompt: ~{_tokens(agent['sys_prompt'])} tokens")
    for q in MEASURE_QUERIES:
        res = retry(companion.call, "POST", "/api/v1/retrieval", {
            "question": q,
            "dataset_ids": tool.get("dataset_ids") or tool.get("kb_ids"),
            "similarity_threshold": tool.get("similarity_threshold", 0.2),
            "vector_similarity_weight": 1 - tool.get("keywords_similarity_weight", 0.3),
            "top_k": tool.get("top_k", 1024),
            "page_size": 12,
        })
        chunks = ((res.get("data") or {}).get("chunks")) or []
        sizes = [_tokens(c.get("content") or c.get("content_with_weight") or "") for c in chunks]
        cum = [sum(sizes[:n]) for n in (4, 6, 8, 12)]
        ids = [m.group(0) for c in chunks[:6]
               for m in [re.search(r"\b(mnt|art|rng|wal|sts)_\d{4}\b", c.get("content") or "")] if m]
        print(f"{q!r}: {len(chunks)} chunks, tokens at top_n 4/6/8/12 = {cum}; top ids {ids}")


def cmd_inspect(args: argparse.Namespace) -> None:
    """Read-only. Shows what an agent will actually run: model, token limits,
    wiring, and whether the two prompt copies (components vs graph) agree -
    a UI save rebuilds from graph, so a stale graph copy silently wins."""
    dsl = load_dsl_file(args.dsl_file) if args.dsl_file else fetch_live_dsl(args.agent)
    comps = dsl["components"]
    for cid, c in comps.items():
        print(f"{cid:28} {c['obj']['component_name']:10} {c.get('upstream')} -> {c.get('downstream')}")
    agent_id = next((k for k, c in comps.items() if c["obj"]["component_name"] == "Agent"), None)
    if agent_id is None:
        return
    p = comps[agent_id]["obj"]["params"]
    form = next((n["data"].get("form", {}) for n in dsl["graph"]["nodes"] if n["id"] == agent_id), {})
    print(f"\nllm_id: {p.get('llm_id')}   graph llm_id: {form.get('llm_id')}")
    for k in ("max_tokens", "maxTokensEnabled", "max_rounds", "message_history_window_size", "cite"):
        print(f"{k}: components={p.get(k)!r} graph={form.get(k)!r}")
    print(f"tools: {[t.get('component_name') for t in p.get('tools') or []]}")
    print(f"user prompt: {[m.get('content') for m in p.get('prompts') or []]}")
    for label, sp in (("components", p.get("sys_prompt") or ""), ("graph", form.get("sys_prompt") or "")):
        print(f"\nsys_prompt [{label}]: ~{_tokens(sp)} tokens, "
              f"hor table={'hor_0005 Simha' in sp}, output format={'# OUTPUT FORMAT' in sp}, "
              f"always-retrieve={'# YOUR CONTENT LIST' in sp}, "
              f"old rashifal refusal={'rashifal nahi dekhta' in sp.lower()}")
    print(f"\nprompt copies identical: {p.get('sys_prompt') == form.get('sys_prompt')}")


# Acceptance checklist from the investigation handoff. Each case is a list of
# turns in one session; the check applies to the LAST turn.
CASES: list[dict[str, Any]] = [
    {"name": "direct request: Hanuman Chalisa",
     "turns": ["Hanuman chalisa do"], "expect": "ids", "must_include": ["art_0049"]},
    {"name": "life situation",
     "turns": ["Aaj mann bahut pareshan hai"], "expect": "ids"},
    {"name": "follow-up after a suggestion",
     "turns": ["Aaj mann bahut pareshan hai", "konsa mantra?"], "expect": "null"},
    {"name": "horoscope with rashi",
     "turns": ["Mera Simha rashi ka rashifal dikhao"], "expect": "hor"},
    {"name": "medical decline",
     "turns": ["Mere ghutne mein bahut dard hai, koi mantra batao"], "expect": "null"},
    {"name": "legal decline",
     "turns": ["Court case jeetne ke liye kya karun"], "expect": "null"},
    {"name": "financial decline",
     "turns": ["Kya mujhe share market mein paisa lagana chahiye"], "expect": "null"},
    {"name": "wallpaper request",
     "turns": ["Hanuman ji ka wallpaper dikhao"], "expect": "ids"},
    {"name": "job worry",
     "turns": ["Meri job nahi lag rahi"], "expect": "ids"},
    {"name": "ask for more",
     "turns": ["Hanuman chalisa do", "koi aur suna do"], "expect": "ids", "no_repeat": True,
     "deity": "hanuman"},
    {"name": "type for the deity on screen",
     "turns": ["Hanuman chalisa do", "hanuman ji ka koi mantra hai?"], "expect": "any",
     "deity": "hanuman"},
]


REQUIRED_KEYS = ("intent_type", "reply_text", "recommended_deity", "jaap_count",
                 "content_ids", "decline_category", "confidence")


def parse_reply(text: str) -> dict[str, Any] | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def cmd_test(args: argparse.Namespace) -> None:
    known = set(json.loads(ID_MAP.read_text(encoding="utf-8")))
    # A guessed id can still be a REAL one (mnt_0012 art_0034 art_0056 passes
    # the map check). Cross-check against what the KB returns for the message:
    # ids outside it came from a refined search at best, invention at worst.
    tool = source_tool_params()
    hor = {f"hor_{i:04d}" for i in range(1, 13)}
    failures = 0
    print(f"agent {args.agent}{' (LIVE source agent)' if args.agent == SOURCE_AGENT_ID else ''}\n")
    for case in CASES:
        session = retry(companion.open_session, args.agent)
        replies = [retry(companion.converse, args.agent, t, session) for t in case["turns"]]
        parsed = [parse_reply(r) for r in replies]
        last = parsed[-1]
        errs = []
        if "**ERROR**" in replies[-1]:
            errs.append("RAGFlow error")
        elif last is None:
            errs.append("reply is not JSON")
            ids = None
        else:
            ids = last.get("content_ids")
        if last is not None:
            missing_keys = [k for k in REQUIRED_KEYS if k not in last]
            if missing_keys:
                # All seven keys are specified only near the END of the system
                # prompt. Missing keys mean RAGFlow trimmed the prompt's tail.
                errs.append(f"missing keys {missing_keys} (system prompt tail truncated?)")
        if ids:
            unknown = [i for i in ids if i not in known and i not in hor]
            if unknown:
                errs.append(f"unknown ids {unknown}")
        exp = case["expect"]
        if exp == "null" and ids:
            errs.append(f"expected null, got {ids}")
        if exp == "ids" and not ids:
            errs.append("expected content ids, got null")
        if exp == "hor" and not (ids and len(ids) == 1 and ids[0] in hor):
            errs.append(f"expected one hor_ code, got {ids}")
        if not replies[-1].lstrip().startswith("{"):
            # parseAnswer() JSON.parses the raw text; a fence or leading prose
            # makes it fall back to showing the raw JSON as the chat message.
            errs.append("reply does not start with '{' (API would show raw JSON to the user)")
        named = last.get("recommended_deity") if last else None
        if ids and named:
            ds = (tool.get("dataset_ids") or tool.get("kb_ids"))[0]
            actual = {i: item_deity(ds, i) for i in ids if not i.startswith("hor_")}
            if args.verbose:
                print(f"        item deities: {actual}")
            wrong = {i: d for i, d in actual.items() if d and d != named}
            if wrong:
                errs.append(f"items are not {named!r}: {wrong}")
        want = case.get("deity")
        if want and last is not None and last.get("recommended_deity") not in (want, None):
            errs.append(f"switched deity to {last.get('recommended_deity')!r}, expected {want!r}")
        for must in case.get("must_include", []):
            if not ids or must not in ids:
                errs.append(f"missing {must}")
        if case.get("no_repeat") and ids and parsed[0]:
            repeated = set(ids) & set(parsed[0].get("content_ids") or [])
            if repeated:
                errs.append(f"repeated earlier ids {sorted(repeated)}")
        warns = []
        if ids:
            found = set(retrieve_ids(tool, case["turns"][-1]))
            unsearched = [i for i in ids if i not in hor and i in known and i not in found]
            if unsearched:
                warns.append(f"valid but not in KB results for the raw message {unsearched} "
                             f"(expected if the query writer or a refined search found them)")
        status = "PASS" if not errs else "FAIL"
        if not errs and warns:
            status = "WARN"
        failures += bool(errs)
        notes = errs + warns
        print(f"[{status}] {case['name']}: ids={ids}" + ("" if not notes else f"  <- {'; '.join(notes)}"))
        if notes or args.verbose:
            print("        " + replies[-1].replace("\n", "\n        "))
    print(f"\n{len(CASES) - failures}/{len(CASES)} passed")
    sys.exit(1 if failures else 0)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, fn in (("build", cmd_build), ("create", cmd_create), ("update", cmd_update)):
        s = sub.add_parser(name)
        s.add_argument("--top-n", type=int, default=6,
                       help="results injected per turn (default 6; 12 overflowed the context budget)")
        s.add_argument("--dsl-file", help="use this canvas export instead of the live agent")
        s.add_argument("--no-tool", action="store_true",
                       help="remove the Agent's Retrieval tool entirely (default: keep it for one refined search)")
        s.set_defaults(fn=fn)
        if name == "create":
            s.add_argument("--title", default=NEW_TITLE)
        if name == "update":
            s.add_argument("--agent", required=True, help="the COPY's agent id")
    i = sub.add_parser("inspect", help="read-only view of an agent's live config")
    i.add_argument("--agent", default=LIVE_AGENT_ID)
    i.add_argument("--dsl-file")
    i.set_defaults(fn=cmd_inspect)
    m = sub.add_parser("measure")
    m.add_argument("--dsl-file")
    m.set_defaults(fn=cmd_measure)
    t = sub.add_parser("test")
    t.add_argument("--agent", required=True)
    t.add_argument("-v", "--verbose", action="store_true")
    t.set_defaults(fn=cmd_test)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
