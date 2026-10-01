#!/usr/bin/env python3
"""experiment-companion — create and talk to a basic companion agent on RAGFlow.

Python 3 standard library only. Nothing to install.

    python3 companion.py probe             # what is on the deployment, and which DSL shape
    python3 companion.py create            # push experiment-companion, print its agent_id
    python3 companion.py ask "namaste"     # one-shot, for smoke tests
    python3 companion.py chat              # interactive multi-turn REPL

Credentials are read from the environment, falling back to the monorepo .env.
They are never printed: `probe` scrubs them, and nothing echoes the key.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

AGENT_TITLE = "experiment-companion"
DSL_PATH = Path(__file__).with_name("companion_dsl.json")

# tools/companion-agent/companion.py -> the monorepo root two levels up.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


# --------------------------------------------------------------------------
# config
# --------------------------------------------------------------------------

def _parse_env_file(path: Path) -> dict[str, str]:
    """Minimal .env reader: KEY=VALUE, ignoring comments, blanks and `export`.

    Deliberately not a full dotenv implementation — it only needs to find two
    keys, and a wrong guess about quoting is visible immediately as an auth
    failure rather than silently corrupting anything.
    """
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            out[key] = value
    return out


def load_config() -> tuple[str, str]:
    """Returns (base_url, api_key). Environment wins over the .env file."""
    file_env = _parse_env_file(ENV_PATH)
    base = os.environ.get("RAGFLOW_BASE_URL") or file_env.get("RAGFLOW_BASE_URL", "")
    key = os.environ.get("RAGFLOW_API_KEY") or file_env.get("RAGFLOW_API_KEY", "")
    missing = [n for n, v in (("RAGFLOW_BASE_URL", base), ("RAGFLOW_API_KEY", key)) if not v]
    if missing:
        sys.exit(
            f"error: {' and '.join(missing)} not set.\n"
            f"       Looked in the environment and {ENV_PATH}"
        )
    return base.rstrip("/"), key


# --------------------------------------------------------------------------
# transport
# --------------------------------------------------------------------------

def call(method: str, path: str, body: dict[str, Any] | None = None,
         timeout: int = 120) -> dict[str, Any]:
    base, key = load_config()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:600]
        sys.exit(f"error: HTTP {e.code} on {method} {path}\n{detail}")
    except urllib.error.URLError as e:
        sys.exit(f"error: cannot reach RAGFlow ({e.reason}) on {method} {path}")


def list_agents() -> list[dict[str, Any]]:
    """Lists agents, tolerating both response shapes.

    The docs say `data` is an array. This deployment returns
    `{"data": {"canvas": [...], "total": n}}` instead, and ignores the `id`
    and `title` query filters entirely — hence no server-side filtering here
    (verified against the live deployment, 2026-09-04).
    """
    # page_size is capped: a value above 100 comes back as `data: null`
    # with code 0 — a silent empty listing, not an error.
    data = call("GET", "/api/v1/agents?page_size=100").get("data")
    if isinstance(data, dict):
        data = data.get("canvas")
    return data if isinstance(data, list) else []


def find_agent_id(title: str = AGENT_TITLE) -> str | None:
    for a in list_agents():
        if a.get("title") == title:
            return a.get("id")
    return None


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def cmd_probe(args: argparse.Namespace) -> None:
    """Reports what exists and dumps one agent's DSL, so the companion's own
    DSL can be written against this deployment's schema and llm_id rather than
    a guess from the docs."""
    agents = list_agents()
    print(f"{len(agents)} agent(s) on this deployment:\n")
    for a in agents:
        print(f"  {a.get('id')}  {a.get('title')!r}")
    if not agents:
        return
    print("\nnote: this build's listing omits `dsl`, so the canvas of an "
          "existing agent\n      cannot be read back here. companion_dsl.json "
          "was derived from the\n      checked-in 'Prabhuji Chat - V2.json' "
          "export instead.")


def cmd_create(args: argparse.Namespace) -> None:
    if not DSL_PATH.is_file():
        sys.exit(f"error: {DSL_PATH.name} not found next to this script")

    existing = find_agent_id()
    if existing and not args.force:
        sys.exit(
            f"error: an agent titled {AGENT_TITLE!r} already exists ({existing}).\n"
            f"       Re-run with --force to create a second one anyway."
        )

    dsl = json.loads(DSL_PATH.read_text(encoding="utf-8"))
    call("POST", "/api/v1/agents", {
        "title": AGENT_TITLE,
        "description": "Basic conversational companion. Created by tools/companion-agent.",
        "dsl": dsl,
    })

    # The create response carries only {code, data: true} — no id — so the id
    # has to be recovered by listing.
    agent_id = find_agent_id()
    if not agent_id:
        sys.exit("error: create reported success but the agent is not in the listing")
    print(f"created {AGENT_TITLE!r}\nagent_id: {agent_id}")


def open_session(agent_id: str) -> str:
    """Opens a conversation and returns its session_id.

    This step is not optional, and its absence is the subtlest failure mode of
    this API. Without a session_id the agent answers every message as a
    stranger: it does not read the `messages` history you send it (only the
    last entry — visible as a `prompt_tokens` of ~6), and the response carries
    no session_id to reuse. A companion that forgets the previous turn looks
    like a bad prompt but is really a missing session.
    """
    res = call("POST", f"/api/v1/agents/{agent_id}/sessions", {}, timeout=60)
    session_id = (res.get("data") or {}).get("id")
    if not session_id:
        sys.exit(f"error: session create returned no id: {json.dumps(res)[:300]}")
    return session_id


def converse(agent_id: str, message: str, session_id: str) -> str:
    """One turn on an existing session. Server-side memory does the
    remembering, so only the new message is sent."""
    res = call("POST", f"/api/v1/agents_openai/{agent_id}/chat/completions", {
        "model": agent_id,
        "messages": [{"role": "user", "content": message}],
        "stream": False,
        "session_id": session_id,
    })
    choices = res.get("choices") or []
    reply = ""
    if choices:
        reply = ((choices[0] or {}).get("message") or {}).get("content") or ""
    return reply or f"(no content in response: {json.dumps(res)[:400]})"


def resolve_agent(explicit: str | None) -> str:
    if explicit:
        return explicit
    agent_id = find_agent_id()
    if not agent_id:
        sys.exit(f"error: no agent titled {AGENT_TITLE!r}. Run `create` first.")
    return agent_id


def cmd_ask(args: argparse.Namespace) -> None:
    agent_id = resolve_agent(args.agent)
    print(converse(agent_id, args.message, open_session(agent_id)))


def cmd_chat(args: argparse.Namespace) -> None:
    agent_id = resolve_agent(args.agent)
    session_id = open_session(agent_id)
    print(f"{AGENT_TITLE} ({agent_id})\nsession {session_id} — Ctrl-D or /quit "
          f"to exit, /new for a fresh session\n")
    while True:
        try:
            message = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not message:
            continue
        if message in ("/quit", "/exit"):
            return
        if message == "/new":
            session_id = open_session(agent_id)
            print(f"\n(new session {session_id})\n")
            continue
        print(f"\n{converse(agent_id, message, session_id)}\n")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    probe = sub.add_parser("probe", help="list agents and dump one agent's DSL")
    probe.set_defaults(func=cmd_probe)

    create = sub.add_parser("create", help="push companion_dsl.json as a new agent")
    create.add_argument("--force", action="store_true",
                        help="create even if an agent with this title exists")
    create.set_defaults(func=cmd_create)

    ask = sub.add_parser("ask", help="send one message and print the reply")
    ask.add_argument("message")
    ask.add_argument("--agent", help="agent id (default: look up by title)")
    ask.set_defaults(func=cmd_ask)

    chat = sub.add_parser("chat", help="interactive multi-turn session")
    chat.add_argument("--agent", help="agent id (default: look up by title)")
    chat.set_defaults(func=cmd_chat)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
