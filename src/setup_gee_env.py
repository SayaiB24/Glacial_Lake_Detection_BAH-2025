"""Write a Google service-account key into Glacier_Website_MAIN/.env.local.

The Next.js route expects GEE_CREDENTIALS_JSON to hold the entire key file as a
single line. Doing that by hand is error prone: the private key contains real
newlines that must survive as \\n inside the value.

Only non-secret identifiers (project id, client email) are printed. The private
key is never echoed, and the output file is covered by .gitignore.

Usage:
    .venv\\Scripts\\python.exe src/setup_gee_env.py <key.json>
"""

from __future__ import annotations

import json
import os
import sys

REQUIRED = ("type", "project_id", "private_key", "client_email")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2

    key_path = argv[1]
    if not os.path.exists(key_path):
        print(f"ERROR: no such file: {key_path}")
        return 1

    try:
        with open(key_path, encoding="utf-8") as fh:
            key = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"ERROR: {key_path} is not valid JSON — {exc}")
        return 1

    missing = [k for k in REQUIRED if not key.get(k)]
    if missing:
        print(f"ERROR: key file is missing required field(s): {', '.join(missing)}")
        print("Download the JSON key for a service account, not an OAuth client id.")
        return 1

    if key.get("type") != "service_account":
        print(f"ERROR: expected type 'service_account', found {key.get('type')!r}.")
        return 1

    pk = key["private_key"]
    if "BEGIN PRIVATE KEY" not in pk:
        print("ERROR: private_key does not look like a PEM block.")
        return 1

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(repo_root, "Glacier_Website_MAIN", ".env.local")

    # json.dumps escapes the newlines inside private_key as \n, which is exactly
    # what the route expects and what keeps the value on one line.
    line = "GEE_CREDENTIALS_JSON=" + json.dumps(key, separators=(",", ":"))

    existing: list[str] = []
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as fh:
            existing = [l.rstrip("\n") for l in fh if not l.startswith("GEE_CREDENTIALS_JSON=")]

    with open(env_path, "w", encoding="utf-8") as fh:
        for l in existing:
            fh.write(l + "\n")
        fh.write(line + "\n")

    print("Earth Engine credentials installed.")
    print(f"  project_id   : {key['project_id']}")
    print(f"  client_email : {key['client_email']}")
    print(f"  written to   : {os.path.relpath(env_path, repo_root)}  ({os.path.getsize(env_path):,} bytes)")
    print()
    print("The private key was not printed. .env.local is gitignored.")
    print("Restart the Next.js server, then check:")
    print("  curl http://localhost:3000/api/gee/compare-lake-area")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
