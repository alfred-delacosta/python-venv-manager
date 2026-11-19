# Copyright Advanced Software and AI Solutions LLC
"""Report installed distribution version and console entry points as JSON."""
from __future__ import annotations

import json
import sys


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else ""
    version = None
    entry_points: list[str] = []
    try:
        from importlib.metadata import distribution, packages_distributions
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": str(exc), "version": None, "entry_points": []}))
        return 1

    dist = None
    if name:
        try:
            dist = distribution(name)
        except Exception:
            # Normalize name like pip does (replace _ with -) and retry.
            alt = name.replace("_", "-")
            try:
                dist = distribution(alt)
            except Exception:
                dist = None

    if dist is None:
        # Fall back to first non-setuptools distribution if name missing.
        try:
            for pkg, dists in packages_distributions().items():
                for dname in dists:
                    if dname.lower() in {"pip", "setuptools", "wheel"}:
                        continue
                    try:
                        dist = distribution(dname)
                        name = dname
                        break
                    except Exception:
                        continue
                if dist is not None:
                    break
        except Exception:
            dist = None

    if dist is not None:
        version = dist.version
        try:
            eps = dist.entry_points
            for ep in eps:
                group = getattr(ep, "group", None)
                if group == "console_scripts":
                    entry_points.append(ep.name)
        except Exception:
            pass

    print(json.dumps({"name": name, "version": version, "entry_points": sorted(set(entry_points))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
