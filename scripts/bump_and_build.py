#!/usr/bin/env python3
import json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = sys.argv[1] if len(sys.argv) > 1 else None
if not VERSION or not re.fullmatch(r"\d+\.\d+\.\d+", VERSION):
    sys.exit("Usage: bump_and_build.py X.Y.Z")

def replace(path, pattern, repl_fn):
    text = path.read_text()
    new = re.sub(pattern, repl_fn, text, count=1)
    if text == new:
        sys.exit(f"pattern not found in {path}")
    path.write_text(new)

# 1) tauri.conf.json
conf = ROOT / "src-tauri" / "tauri.conf.json"
data = json.loads(conf.read_text())
data["package"]["version"] = VERSION
conf.write_text(json.dumps(data, indent=2))

# 2) Cargo.toml
replace(
    ROOT / "src-tauri" / "Cargo.toml",
    r'(?m)^(version\s*=\s*")([0-9.]+)(")',
    lambda m: f"{m.group(1)}{VERSION}{m.group(3)}"
)

# 3) package.json
pkg = ROOT / "package.json"
data = json.loads(pkg.read_text())
data["version"] = VERSION
pkg.write_text(json.dumps(data, indent=2))

# 4) build
subprocess.check_call(["npm", "run", "tauri:build"], cwd=ROOT)
print("Done, version", VERSION)

#example: python3 scripts/bump_and_build.py 0.2.0