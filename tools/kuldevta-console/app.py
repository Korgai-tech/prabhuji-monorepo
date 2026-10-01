#!/usr/bin/env python3
"""
Kuldevta Khoj — a QA console for the STAGE api.

Local:   python3 app.py                    # -> http://localhost:8787
Render:  gunicorn is not needed; `python3 app.py` reads $PORT and binds 0.0.0.0.

WHY A PROXY AND NOT A PLAIN HTML FILE
The api sets CORS_ALLOWED_ORIGINS to a fixed allowlist, so a browser page on
another origin is refused before the request is even made. This process serves
the page AND forwards /api/* from Python, where CORS does not apply. Nothing
about the api changes to make this work.

  ── READ THIS BEFORE EXPOSING IT TO THE INTERNET ──────────────────────────
  Stage runs the STUB otp provider: the code is always 1234 and ANY valid
  Indian mobile number logs in. This console therefore mints a valid stage JWT
  for any account somebody names. That is fine on a laptop and NOT fine on a
  public URL, so two guards are compulsory in a hosted deploy:

    CONSOLE_PASSWORD  HTTP Basic password. Without it the server refuses to
                      bind to anything but loopback — a hosted deploy simply
                      will not start.
    PROXY_ALLOWLIST   The proxy forwards ONLY the endpoints this console uses
                      (below). It is not a general tunnel into the api, and in
                      particular /admin/* is unreachable through it.

  API_BASE must stay a stage host. A production-looking host is refused.
"""

import argparse
import base64
import hmac
import json
import os
import re
import sys
import urllib.error
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.environ.get("API_BASE", "https://stage-prabhuji-api.krutyug.ai").rstrip("/")
PASSWORD = os.environ.get("CONSOLE_PASSWORD", "")

# The proxy forwards these and nothing else. An open tunnel to the api would be
# worse than the console itself: /admin/* sits on the same host.
PROXY_ALLOWLIST = (
    re.compile(r"^/auth/otp/(send|verify|resend)$"),
    re.compile(r"^/users/me$"),
    re.compile(r"^/kuldevta/identify$"),
    re.compile(r"^/chat/(messages|history)$"),
    re.compile(r"^/horoscope/zodiac-signs(\?.*)?$"),
)


def path_allowed(path: str) -> bool:
    return any(rx.match(path) for rx in PROXY_ALLOWLIST)

PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kuldevta Khoj Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root{
    --ink:#231a12; --ink-soft:#6b5c4d; --ink-faint:#9b8b7a;
    --ground:#f7f3ec; --card:#fffdf9; --line:#e4dbcd;
    --accent:#a8442a; --accent-soft:#f0e0d8;
    --gold:#b8862f; --ok:#3f6b45; --bad:#a8442a;
    --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
    --sans:"Inter",system-ui,-apple-system,sans-serif;
    --display:"Marcellus",Georgia,serif;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --ink:#f0e8dd; --ink-soft:#b3a494; --ink-faint:#7d6f60;
      --ground:#17130f; --card:#211b16; --line:#342b23;
      --accent:#e08160; --accent-soft:#3a251d;
      --gold:#d8a850; --ok:#7fb388; --bad:#e08160;
    }
  }
  :root[data-theme="dark"]{
    --ink:#f0e8dd; --ink-soft:#b3a494; --ink-faint:#7d6f60;
    --ground:#17130f; --card:#211b16; --line:#342b23;
    --accent:#e08160; --accent-soft:#3a251d;
    --gold:#d8a850; --ok:#7fb388; --bad:#e08160;
  }
  *{box-sizing:border-box}
  body{background:var(--ground);color:var(--ink);font-family:var(--sans);
       margin:0;padding:24px;line-height:1.5}
  .wrap{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
  header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  h1{font-family:var(--display);font-size:27px;font-weight:400;margin:0;letter-spacing:.01em}
  .env{font-family:var(--mono);font-size:11px;color:var(--ink-faint);
       border:1px solid var(--line);border-radius:99px;padding:3px 10px}
  .cols{display:grid;grid-template-columns:minmax(320px,400px) 1fr;gap:20px;align-items:start}
  @media (max-width:900px){.cols{grid-template-columns:1fr}}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
  .card + .card{margin-top:16px}
  h2{font-family:var(--display);font-weight:400;font-size:16px;margin:0 0 14px;
     letter-spacing:.02em}
  label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;
        color:var(--ink-faint);margin:12px 0 5px;font-weight:500}
  input,textarea{width:100%;background:var(--ground);color:var(--ink);
    border:1px solid var(--line);border-radius:7px;padding:9px 11px;
    font-family:var(--sans);font-size:14px}
  input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
  button{background:var(--accent);color:#fff;border:0;border-radius:7px;
    padding:9px 15px;font-family:var(--sans);font-size:13px;font-weight:600;
    cursor:pointer}
  button:disabled{opacity:.45;cursor:not-allowed}
  button.ghost{background:transparent;color:var(--ink-soft);border:1px solid var(--line)}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
  .row > *{flex:1}
  .row > button{flex:0 0 auto}
  .kv{font-family:var(--mono);font-size:12px;display:grid;
      grid-template-columns:auto 1fr;gap:3px 12px;margin-top:10px}
  .kv dt{color:var(--ink-faint)}
  .kv dd{margin:0;word-break:break-all}
  .yes{color:var(--ok);font-weight:500}
  .no{color:var(--ink-faint)}
  .deity{display:flex;gap:14px;align-items:flex-start;margin-top:12px}
  .deity img{width:84px;height:84px;border-radius:9px;object-fit:cover;
    border:1px solid var(--line);flex:0 0 auto;background:var(--ground)}
  .deity h3{font-family:var(--display);font-weight:400;margin:0;font-size:20px}
  .tier{display:inline-block;font-family:var(--mono);font-size:10px;
    text-transform:uppercase;letter-spacing:.08em;padding:2px 8px;border-radius:99px;
    background:var(--accent-soft);color:var(--accent);margin-top:5px}
  .reasons{margin:9px 0 0;padding-left:17px;font-size:13px;color:var(--ink-soft)}
  .reasons li{margin:3px 0}
  #log{display:flex;flex-direction:column;gap:11px;min-height:260px;
       max-height:52vh;overflow-y:auto;padding-right:4px}
  .msg{max-width:78%;padding:10px 13px;border-radius:12px;font-size:14px;
       white-space:pre-wrap;word-wrap:break-word}
  .msg.user{align-self:flex-end;background:var(--accent);color:#fff;
            border-bottom-right-radius:3px}
  .msg.bot{align-self:flex-start;background:var(--ground);
           border:1px solid var(--line);border-bottom-left-radius:3px}
  .msg.err{align-self:stretch;max-width:100%;background:transparent;
           border:1px dashed var(--bad);color:var(--bad);
           font-family:var(--mono);font-size:12px}
  .turn{font-family:var(--mono);font-size:10px;color:var(--ink-faint);
        margin:0 4px 2px;letter-spacing:.05em}
  .turn.t2{color:var(--gold);font-weight:500}
  .hint{font-size:12px;color:var(--ink-faint);margin:9px 0 0;line-height:1.45}
  .hint b{color:var(--ink-soft);font-weight:600}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .chip{font-size:12px;padding:5px 10px;border-radius:99px;cursor:pointer;
    background:transparent;border:1px solid var(--line);color:var(--ink-soft);
    font-weight:400}
  .chip:hover{border-color:var(--accent);color:var(--accent)}
  .content-groups{font-family:var(--mono);font-size:11px;color:var(--ink-faint);
    margin-top:5px}
  .composer{display:flex;gap:8px;margin-top:14px}
  .composer textarea{resize:vertical;min-height:44px}
  .composer button{flex:0 0 auto;align-self:stretch}
  .sess{font-family:var(--mono);font-size:11px;color:var(--ink-faint);
        margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Kuldevta Khoj Console</h1>
    <span class="env" id="env">stage</span>
    <span class="env">OTP 1234</span>
  </header>

  <div class="cols">
    <div>
      <div class="card">
        <h2>1 · Sign in</h2>
        <div class="row">
          <div>
            <label for="phone">Phone</label>
            <input id="phone" value="9900000006" inputmode="numeric">
          </div>
          <button id="login">Log in</button>
        </div>
        <p class="hint">Stage uses the stub OTP provider — any valid number works and
          the code is always <b>1234</b>.</p>
        <dl class="kv" id="cfg"></dl>
      </div>

      <div class="card">
        <h2>2 · Find the kuldevta</h2>
        <label for="surname">Surname</label><input id="surname" value="Patil">
        <label for="place">Ancestral place</label><input id="place" value="Satara, Maharashtra">
        <label for="community">Community</label><input id="community" value="Maratha">
        <label for="gotra">Gotra</label><input id="gotra" value="pata nahi">
        <label for="temple">Temple mentioned</label><input id="temple" value="Jejuri wale khandoba">
        <label for="photo">Mandir photo</label><input id="photo" value="bhandara wale devta">
        <div class="row" style="margin-top:14px">
          <button id="identify">Identify</button>
          <button class="ghost" id="preset-alt" title="Rathore Rajput -> nagnechi">Switch deity</button>
        </div>
        <div id="deity"></div>
      </div>
    </div>

    <div class="card">
      <h2>3 · Talk to your kuldevta</h2>
      <div id="log"></div>
      <div class="composer">
        <textarea id="msg" rows="2" placeholder="Pranam. Aap kaun hain?"></textarea>
        <button id="send">Send</button>
      </div>
      <div class="chips" id="chips"></div>
      <div class="sess">
        <span id="sess">no session</span>
        <button class="ghost" id="newsess" style="padding:4px 10px;font-size:11px">New conversation</button>
      </div>
      <p class="hint"><b>The test that matters:</b> ask about the mantra or niyam on the
        <b>second</b> message. RAGFlow substitutes Begin variables only on the turn they
        arrive, so before the fix the persona loses its temple, mantra and niyam from
        turn 2 — and starts denying it is your kuldevta.</p>
    </div>
  </div>
</div>

<script>
const $ = (id) => document.getElementById(id);
let token = null, sessionId = null, agentId = null, turn = 0;

async function api(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: Object.assign({ "Content-Type": "application/json" },
      token ? { Authorization: "Bearer " + token } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

function bubble(cls, text, label) {
  const wrap = document.createElement("div");
  if (label) {
    const t = document.createElement("div");
    t.className = "turn" + (label.startsWith("turn 2") ? " t2" : "");
    t.textContent = label;
    t.style.alignSelf = cls === "user" ? "flex-end" : "flex-start";
    $("log").appendChild(t);
  }
  wrap.className = "msg " + cls;
  wrap.textContent = text;
  $("log").appendChild(wrap);
  $("log").scrollTop = $("log").scrollHeight;
  return wrap;
}

function renderConfig(c) {
  const arm = c.showKuldevtaChat || c.show_kuldeveta_chat ? "kuldevta" : (c.enabled ? "other" : "control");
  const flag = (v) => v ? '<span class="yes">true</span>' : '<span class="no">false</span>';
  $("cfg").innerHTML =
    "<dt>arm</dt><dd>" + arm + "</dd>" +
    "<dt>enabled</dt><dd>" + flag(c.enabled) + "</dd>" +
    "<dt>agentId</dt><dd>" + (c.agentId || "—") + "</dd>" +
    "<dt>show_kuldeveta_chat</dt><dd>" + flag(c.show_kuldeveta_chat ?? c.showKuldevtaChat) + "</dd>" +
    "<dt>kuldevtaAssigned</dt><dd>" + flag(c.kuldevtaAssigned) + "</dd>";
  agentId = c.agentId;
}

$("login").onclick = async () => {
  $("login").disabled = true;
  try {
    const phone = $("phone").value.trim();
    const send = await api("POST", "/auth/otp/send",
      { phoneCountryCode: "+91", phoneNumber: phone });
    if (!send.json?.data?.otpSessionId) {
      bubble("err", "OTP send failed: " + JSON.stringify(send.json)); return;
    }
    const ver = await api("POST", "/auth/otp/verify",
      { otpSessionId: send.json.data.otpSessionId, otp: "1234" });
    if (!ver.json?.data?.token) {
      bubble("err", "OTP verify failed: " + JSON.stringify(ver.json)); return;
    }
    token = ver.json.data.token;
    const me = await api("GET", "/users/me");
    renderConfig(me.json.data.chatConfig);
    newSession();
    bubble("bot", "Signed in as " + phone + ".");
  } finally { $("login").disabled = false; }
};

$("preset-alt").onclick = () => {
  $("surname").value = "Rathore";
  $("community").value = "Rathore Rajput";
  $("place").value = ""; $("gotra").value = ""; $("temple").value = ""; $("photo").value = "";
};

$("identify").onclick = async () => {
  if (!token) { bubble("err", "Log in first."); return; }
  $("identify").disabled = true;
  try {
    const r = await api("POST", "/kuldevta/identify", {
      surname: $("surname").value, ancestralPlace: $("place").value,
      community: $("community").value, gotra: $("gotra").value,
      templeMentioned: $("temple").value, mandirPhoto: $("photo").value,
    });
    const d = r.json?.data;
    if (!d) { bubble("err", "identify " + r.status + ": " + JSON.stringify(r.json)); return; }
    const t = d.temple || {};
    const where = [t.village, t.district, t.state].filter(Boolean).join(", ");
    $("deity").innerHTML =
      '<div class="deity">' +
      (d.imageUrl ? '<img src="' + d.imageUrl + '" alt="">' : "") +
      "<div><h3>" + (d.nameDevanagari || "") + " · " + d.nameRoman + "</h3>" +
      '<div style="font-size:13px;color:var(--ink-soft)">' + where + "</div>" +
      '<span class="tier">' + d.tier + " · " + (d.matchedOn || []).join(" + ") + "</span>" +
      '<ul class="reasons">' + (d.reasons || []).map((x) => "<li>" + x + "</li>").join("") +
      "</ul></div></div>";
    const me = await api("GET", "/users/me");
    renderConfig(me.json.data.chatConfig);
    bubble("bot", "Assigned: " + d.nameRoman + " (" + d.tier + "). Start a new conversation to speak with them.");
  } finally { $("identify").disabled = false; }
};

function newSession() {
  sessionId = null; turn = 0;
  $("log").innerHTML = "";
  $("sess").textContent = "no session";
}
$("newsess").onclick = newSession;

async function send(text) {
  if (!token) { bubble("err", "Log in first."); return; }
  if (!agentId) { bubble("err", "No agent for this user's arm."); return; }
  if (!text.trim()) return;
  turn += 1;
  bubble("user", text, "turn " + turn);
  $("send").disabled = true;
  try {
    const body = { message: text, agentId };
    if (sessionId) body.sessionId = sessionId;
    const r = await api("POST", "/chat/messages", body);
    if (r.status !== 200) {
      bubble("err", "HTTP " + r.status + " · " + (r.json?.errorCode || "") + " — " +
        (r.json?.message || JSON.stringify(r.json)));
      return;
    }
    const d = r.json.data;
    sessionId = d.sessionId;
    $("sess").textContent = "session " + sessionId.slice(0, 8) + " · turn " + turn;
    bubble("bot", d.botMessage.message, "turn " + turn);
    const groups = d.botMessage.content || {};
    const filled = Object.entries(groups).filter(([, v]) => v && v.length);
    if (filled.length) {
      const el = document.createElement("div");
      el.className = "content-groups";
      el.textContent = filled.map(([k, v]) =>
        k + ": " + v.map((i) => i.id).join(", ")).join("  |  ");
      $("log").appendChild(el);
    }
  } finally { $("send").disabled = false; $("msg").value = ""; }
}

$("send").onclick = () => send($("msg").value);
$("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("msg").value); }
});

const PROMPTS = [
  "Pranam. Aap kaun hain?",
  "Aapka mandir kahan hai?",
  "Aapka mantra kya hai?",
  "Mujhe aapke niyam bataiye",
  "Mera beta bimar hai, aap use theek kar dijiye",
  "Aaj ka rashifal batao, meri rashi Mesh hai",
];
$("chips").innerHTML = PROMPTS.map((p) =>
  '<button class="chip">' + p + "</button>").join("");
[...document.querySelectorAll(".chip")].forEach((b, i) => {
  b.onclick = () => send(PROMPTS[i]);
});

fetch("/api/__base").then((r) => r.json()).then((d) => {
  $("env").textContent = d.base.replace(/^https?:\/\//, "");
}).catch(() => {});
</script>
</body>
</html>
"""


# Derived from the password, so it rotates when the password does and there is
# nothing extra to configure. Not a per-user session — one shared door, one key.
SESSION_COOKIE = "kuldevta_console"


def session_token() -> str:
    return hmac.new(PASSWORD.encode(), b"kuldevta-console", "sha256").hexdigest()


class Handler(BaseHTTPRequestHandler):
    def _basic_ok(self) -> bool:
        """HTTP Basic, ANY username — only the password is checked."""
        header = self.headers.get("Authorization") or ""
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
        except Exception:
            return False
        _, _, supplied = decoded.partition(":")
        # Constant-time: this is reachable from the internet.
        return hmac.compare_digest(supplied, PASSWORD)

    def _cookie_ok(self) -> bool:
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            name, _, value = part.strip().partition("=")
            if name == SESSION_COOKIE:
                return hmac.compare_digest(value, session_token())
        return False

    def _authorised(self) -> bool:
        if not PASSWORD:
            return True
        return self._cookie_ok() or self._basic_ok()

    def _challenge(self, prompt: bool = True):
        """401.

        `prompt` controls the `WWW-Authenticate` header, and it matters more
        than it looks: the browser raises its native credential dialog for ANY
        401 carrying that header, including one answering a `fetch()`. So the
        PAGE challenges — there is no other way in — and `/api/*` does not.
        An unauthenticated api call gets a plain JSON 401 the UI can render,
        never a popup on a page the user already unlocked.
        """
        self.send_response(401)
        if prompt:
            self.send_header("WWW-Authenticate", 'Basic realm="Kuldevta console"')
        body = b'{"success":false,"errorCode":"CONSOLE_UNAUTHORISED"}'
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send(self, status, body, ctype="application/json", extra_headers=None):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for name, value in extra_headers or []:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/healthz":  # before auth — Render's probe carries none
            return self._send(200, json.dumps({"ok": True, "base": BASE}))
        if not self._authorised():
            return self._challenge()
        if self.path in ("/", "/index.html"):
            # Unlocking the page mints the cookie every later request rides on,
            # so the api calls never trip the browser's credential dialog.
            # HttpOnly: the page never needs to read it, and script that cannot
            # read a credential cannot leak one.
            extra = (
                [(
                    "Set-Cookie",
                    "%s=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400"
                    % (SESSION_COOKIE, session_token()),
                )]
                if PASSWORD
                else None
            )
            return self._send(200, PAGE, "text/html; charset=utf-8", extra)
        if self.path == "/api/__base":
            return self._send(200, json.dumps({"base": BASE}))
        if self.path.startswith("/api/"):
            return self._proxy("GET")
        self._send(404, json.dumps({"error": "not found"}))

    def do_HEAD(self):
        """Render's platform probe sends HEAD /, and BaseHTTPRequestHandler
        answers 501 for any verb it has no handler for. Harmless, but it puts a
        red line in the deploy log that reads like a broken service."""
        if self.path == "/healthz":
            return self._send(200, b"", "application/json")
        if not self._authorised():
            return self._challenge()
        self._send(200, b"", "text/html; charset=utf-8")

    def do_POST(self):
        if not self._authorised():
            return self._challenge(prompt=False)
        if self.path.startswith("/api/"):
            return self._proxy("POST")
        self._send(404, json.dumps({"error": "not found"}))

    def _proxy(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else None
        upstream = self.path[len("/api"):]
        if not path_allowed(upstream):
            # Deliberately specific: a 404 here is a bug in the console, not a
            # missing endpoint upstream.
            return self._send(
                403,
                json.dumps({
                    "success": False,
                    "errorCode": "PROXY_PATH_NOT_ALLOWED",
                    "message": "This console only proxies the kuldevta QA endpoints.",
                }),
            )
        url = BASE + upstream
        headers = {"Content-Type": "application/json"}
        auth = self.headers.get("Authorization")
        if auth:
            headers["Authorization"] = auth
        req = urllib.request.Request(url, method=method, headers=headers, data=payload)
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                self._send(r.status, r.read())
        except urllib.error.HTTPError as e:
            self._send(e.code, e.read())
        except Exception as e:  # network/timeout — surface it in the UI, not the console
            self._send(
                502,
                json.dumps({"success": False, "errorCode": "PROXY_ERROR", "message": str(e)}),
            )

    def log_message(self, fmt, *args):  # keep the terminal readable
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8787)))
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()
    BASE = args.base.rstrip("/")

    if re.search(r"prod|production", BASE, re.I):
        sys.exit("Refusing to run against a production-looking host: " + BASE)

    # Render (and any other host) sets PORT. Binding 0.0.0.0 without a password
    # would publish a "log in as any stage user" button, so that combination is
    # refused rather than warned about.
    hosted = bool(os.environ.get("PORT"))
    if hosted and not PASSWORD:
        sys.exit(
            "CONSOLE_PASSWORD is required when PORT is set (a hosted deploy).\n"
            "This console mints a stage JWT for any phone number somebody types,\n"
            "because stage's stub otp provider accepts 1234 for all of them."
        )
    host = "0.0.0.0" if hosted else "127.0.0.1"  # noqa: S104 - see the guard above

    url = "http://localhost:%d" % args.port
    print("Kuldevta console  ->  %s (bound %s)" % (url, host))
    print("Proxying to       ->  " + BASE)
    print("Password          ->  " + ("set" if PASSWORD else "none (loopback only)"))
    if not hosted and not args.no_open:
        webbrowser.open(url)
    ThreadingHTTPServer((host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
