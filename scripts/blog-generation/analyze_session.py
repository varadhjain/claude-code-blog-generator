#!/usr/bin/env python3
"""
Analyze a Claude Code session JSONL file to extract narrative structure.
This helps us understand what stories can be inferred from the data.
"""

import json
import sys
from collections import defaultdict
from typing import List, Dict, Any


def load_session(filepath: str) -> List[Dict[str, Any]]:
    """Load JSONL session file."""
    messages = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                messages.append(json.loads(line))
    return messages


def extract_tools_used(messages: List[Dict]) -> Dict[str, int]:
    """Count tool usage across the session."""
    tool_counts = defaultdict(int)

    for msg in messages:
        if msg.get('type') == 'assistant':
            content = msg.get('message', {}).get('content', [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'tool_use':
                        tool_name = item.get('name', 'unknown')
                        tool_counts[tool_name] += 1

    return dict(tool_counts)


def extract_files_touched(messages: List[Dict]) -> set:
    """Find all files that were read, written, or edited."""
    files = set()

    for msg in messages:
        if msg.get('type') == 'assistant':
            content = msg.get('message', {}).get('content', [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'tool_use':
                        tool_input = item.get('input', {})
                        # Check for file_path in various tool inputs
                        if 'file_path' in tool_input:
                            files.add(tool_input['file_path'])

    return files


def get_user_messages_text(messages: List[Dict]) -> List[str]:
    """Extract text from user messages."""
    user_texts = []

    for msg in messages:
        if msg.get('type') == 'user':
            content = msg.get('message', {}).get('content', '')
            if isinstance(content, str):
                user_texts.append(content)

    return user_texts


def get_assistant_responses(messages: List[Dict]) -> List[str]:
    """Extract text responses from assistant."""
    responses = []

    for msg in messages:
        if msg.get('type') == 'assistant':
            content = msg.get('message', {}).get('content', [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'text':
                        responses.append(item.get('text', ''))

    return responses


def analyze_session(filepath: str):
    """Main analysis function."""
    print(f"Analyzing session: {filepath}\n")
    print("=" * 80)

    messages = load_session(filepath)

    # Basic stats
    msg_types = defaultdict(int)
    for msg in messages:
        msg_types[msg.get('type', 'unknown')] += 1

    print("\n📊 MESSAGE BREAKDOWN")
    print("-" * 80)
    for msg_type, count in sorted(msg_types.items()):
        print(f"  {msg_type:30} {count:4} messages")

    # Tool usage
    print("\n🔧 TOOLS USED")
    print("-" * 80)
    tools = extract_tools_used(messages)
    for tool, count in sorted(tools.items(), key=lambda x: x[1], reverse=True):
        print(f"  {tool:30} {count:4} times")

    # Files touched
    print("\n📁 FILES TOUCHED")
    print("-" * 80)
    files = extract_files_touched(messages)
    for file in sorted(files):
        print(f"  {file}")

    # User journey
    print("\n💬 USER JOURNEY")
    print("-" * 80)
    user_messages = get_user_messages_text(messages)
    for i, msg in enumerate(user_messages[:5], 1):
        preview = msg[:120].replace('\n', ' ').strip()
        print(f"\n{i}. {preview}...")

    if len(user_messages) > 5:
        print(f"\n... and {len(user_messages) - 5} more messages")

    # Summary
    print("\n" + "=" * 80)
    print("\n✅ NARRATIVE POTENTIAL")
    print("-" * 80)
    print(f"  Total conversation turns: {len([m for m in messages if m.get('type') in ['user', 'assistant']])}")
    print(f"  Tools invoked: {sum(tools.values())} times across {len(tools)} different tools")
    print(f"  Files involved: {len(files)} files")
    print(f"  User interactions: {len(user_messages)} messages")
    print()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python analyze_session.py <session.jsonl>")
        sys.exit(1)

    analyze_session(sys.argv[1])
