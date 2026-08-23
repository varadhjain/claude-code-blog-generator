#!/usr/bin/env python3
"""
Tweet -> SessionMessage JSONL adapter (read-only POC).

Turns the user's tweet export (from bird) into a `.jsonl` file in the exact
SessionMessage shape the blog-post-generator already ingests:

    { "type": ..., "message": {"role": ..., "content": ...}, "timestamp": ..., "index": N }

This lets the EXISTING `ccblog` pipeline generate a blog draft from your tweets
with NO TypeScript changes — point it at the produced .jsonl.

Selection modes:
  --top N            top N of your own tweets by engagement (default: 15)
  --thread <id>      all tweets in a conversation (a thread), chronological
  --since YYYY-MM-DD only tweets on/after this date

Usage:
  python scripts/tweets_to_session.py \
      --input ~/Documents/twitter-export/full_tweets.json \
      --top 15 \
      --out ~/.ccblog/tweet-drafts/top-tweets.session.jsonl
"""

import argparse
import json
import os
from datetime import datetime

_TWITTER_TS = "%a %b %d %H:%M:%S %z %Y"


def _engagement(t):
    return (t.get("likeCount", 0) or 0) + 2 * (t.get("retweetCount", 0) or 0) + (t.get("replyCount", 0) or 0)


def _iso(created):
    try:
        return datetime.strptime(created, _TWITTER_TS).isoformat()
    except (TypeError, ValueError):
        return created or ""


def _has_valid_date(created):
    try:
        datetime.strptime(created, _TWITTER_TS)
        return True
    except (TypeError, ValueError):
        return False


def _id_sort_key(t):
    """Sort by numeric id (snowflake ids vary in digit-length, so string
    comparison misorders across tweet eras); non-numeric ids sort last."""
    try:
        return (0, int(t.get("id")))
    except (TypeError, ValueError):
        return (1, str(t.get("id")))


def select(tweets, args):
    own = [t for t in tweets if not (t.get("text") or "").startswith("RT @")]
    if args.thread:
        rows = [t for t in tweets if str(t.get("conversationId")) == str(args.thread)]
        rows.sort(key=_id_sort_key)  # chronological (ids are monotonic snowflakes)
        return rows
    if args.since:
        own = [
            t for t in own
            if _has_valid_date(t.get("createdAt")) and _iso(t.get("createdAt"))[:10] >= args.since
        ]
    own.sort(key=_engagement, reverse=True)
    return own[: args.top]


def to_session(tweets, label):
    """Build a SessionMessage list the blog pipeline understands."""
    msgs = []
    # Framing message acts as the 'goal' the generator extracts.
    msgs.append({
        "type": "user",
        "message": {
            "role": "user",
            "content": (
                f"Draft a blog post built from my own tweets ({label}). "
                "Find the through-line across them, keep my voice, and expand the "
                "best ideas into prose. Quote tweets where they land."
            ),
        },
        "timestamp": _iso(tweets[0].get("createdAt")) if tweets else "",
        "index": 0,
    })
    for i, t in enumerate(tweets, start=1):
        m = (f"[{_iso(t.get('createdAt'))[:10]}] "
             f"({t.get('likeCount',0)}♥ {t.get('retweetCount',0)}🔁 {t.get('replyCount',0)}💬) "
             f"{(t.get('text') or '').strip()}")
        msgs.append({
            "type": "user",
            "message": {"role": "user", "content": m},
            "timestamp": _iso(t.get("createdAt")),
            "index": i,
        })
    return msgs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=os.path.expanduser("~/Documents/twitter-export/full_tweets.json"))
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--thread")
    ap.add_argument("--since")
    ap.add_argument("--out", default=os.path.expanduser("~/.ccblog/tweet-drafts/top-tweets.session.jsonl"))
    args = ap.parse_args()

    with open(args.input) as f:
        tweets = json.load(f)

    chosen = select(tweets, args)
    if not chosen:
        raise SystemExit("No tweets matched the selection.")

    label = (f"thread {args.thread}" if args.thread
             else f"top {len(chosen)} by engagement"
             + (f" since {args.since}" if args.since else ""))
    session = to_session(chosen, label)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        for m in session:
            f.write(json.dumps(m) + "\n")

    print(f"wrote {len(session)} messages ({len(chosen)} tweets, {label})")
    print(f"-> {args.out}")
    print("\nGenerate a draft with the existing tool, e.g.:")
    print(f"  cd {os.path.dirname(os.path.dirname(os.path.abspath(__file__)))}")
    print(f"  npx ccblog {args.out}        # or: bun run ccblog.ts {args.out}")


if __name__ == "__main__":
    main()
