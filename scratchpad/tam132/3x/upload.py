#!/usr/bin/env python3
"""TAM-132 — upload 6 3x Figma icons via /admin/media/presign, capture publicUrls.

Runs against local dev (docker compose up: postgres+redis+floci-aws;
nx serve api on 3300). Writes uploaded-urls.json alongside the PNGs.
"""
import json
import mimetypes
import pathlib
import sys
import urllib.request

API = "http://localhost:3300"
EMAIL = "admin@local.tam"
PASSWORD = "DevOnly-TAM132-Bootstrap-Password"

HERE = pathlib.Path(__file__).parent

# 3x PNGs → CMS shortcut key
FILES = {
    "shortcut-aarti-3x.png": "aarti_bhajans",
    "shortcut-mantras-3x.png": "mantras_stutis",
    "shortcut-wallpaper-3x.png": "set_wallpaper",
    "shortcut-status-3x.png": "set_status",
    "shortcut-horoscope-3x.png": "horoscope",
    "shortcut-ringtone-3x.png": "set_ringtone",
}


def post_json(url, body, headers=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def put_bytes(url, body, headers):
    req = urllib.request.Request(url, data=body, method="PUT")
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def main():
    print("[1/3] login as admin…", flush=True)
    r = post_json(f"{API}/auth/login", {"email": EMAIL, "password": PASSWORD})
    token = r["data"]["token"]
    auth = {"Authorization": f"Bearer {token}"}
    print(f"    token acquired ({len(token)} chars)", flush=True)

    results = {}
    for i, (fname, shortcut_key) in enumerate(FILES.items(), start=1):
        path = HERE / fname
        size = path.stat().st_size
        content_type = mimetypes.guess_type(fname)[0] or "image/png"
        print(f"[2/3][{i}/6] {shortcut_key} ← {fname} ({size} bytes, {content_type})", flush=True)

        # presign
        presign = post_json(
            f"{API}/admin/media/presign",
            {
                "module": "home",
                "entity": "homeShortcut",
                "field": "iconUrl",
                "filename": fname,
                "contentType": content_type,
                "sizeBytes": size,
            },
            headers=auth,
        )["data"]
        upload_url = presign["uploadUrl"]
        public_url = presign["publicUrl"]
        put_headers = presign["headers"]
        print(f"      presigned; key={presign['key']}", flush=True)

        # upload
        with open(path, "rb") as f:
            body = f.read()
        code = put_bytes(upload_url, body, put_headers)
        assert code in (200, 204), f"PUT {upload_url} returned {code}"
        print(f"      PUT ok ({code}); public_url={public_url}", flush=True)

        results[shortcut_key] = {
            "file": fname,
            "size": size,
            "contentType": content_type,
            "key": presign["key"],
            "publicUrl": public_url,
        }

    out = HERE / "uploaded-urls.json"
    out.write_text(json.dumps(results, indent=2))
    print(f"[3/3] wrote {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
