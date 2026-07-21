# Examples

## Block chat-context references in comments and docs

The rule that started this project. Coding agents write comments and docs
that assume the reader was in the chat: "as discussed", "as mentioned
above", "per our conversation". The next person to open that file has no
idea what was discussed or where. Telling the agent to stop works for an
hour; once the session gets long enough, the instruction dilutes and the
habit comes back. This rule makes the ban mechanical.

Put it in `~/.config/minos/rules.jsonc` to enforce it everywhere:

```jsonc
{
  "rules": [
    {
      "id": "no-chat-context-in-comments",
      "summary": "Comments/docs must not assume the reader has chat context",
      "appliesTo": { "tools": ["Edit", "Write"] },
      "trigger": {
        "type": "contains",
        "patterns": [
          "as discussed",
          "as mentioned above",
          "per our conversation",
          "as we discussed",
          "in our conversation",
          "as requested earlier"
        ]
      },
      "action": "block",
      "message": "Comments and docs cannot assume the reader has the current chat context. Rewrite the text as self-contained: state the fact or constraint directly instead of referencing the conversation."
    }
  ]
}
```

Field by field:

- `appliesTo.tools: ["Edit", "Write"]` - content rule: it checks files the
  agent writes, never shell commands. No `pathGlob` means every file type is
  covered (code comments, markdown, commit templates, all of it).
- `trigger.contains` - case-insensitive literal match on the written file's
  content. These phrases are near-certain signs of chat-context leakage.
- `action: "block"` - the write itself has already happened by the time a
  content rule runs, so "block" here means the agent gets the message as a
  hard error and must rewrite the file before moving on.
- `message` - tells the agent the fix (make the text self-contained), not
  just the offense.

One honest caveat: a file may legitimately contain these phrases, and the
prime example is the one you are reading, since Minos's own docs quote the
trigger patterns. That is what per-project `disable` is for. This repo
carries in `.minos/rules.jsonc`:

```jsonc
{
  "disable": [
    { "id": "no-chat-context-in-comments", "reason": "this repo's docs quote the trigger patterns as examples" }
  ]
}
```

The rule stays global; this one project opts out with an audit trail, and
the config UI shows it greyed out with that reason.

## Block AI co-author trailers on commits

Same disease, different symptom: coding agents love appending attribution
trailers to commit messages, and instructions in AGENTS.md / CLAUDE.md stop
working once the session gets long enough. This rule makes the ban mechanical.

Put it in `~/.config/minos/rules.jsonc` to enforce it in every project:

```jsonc
{
  "rules": [
    {
      "id": "no-claude-coauthor",
      "summary": "Never add Claude as co-author on commits",
      "appliesTo": { "tools": ["Bash"], "commandMatch": ["commit"] },
      "trigger": {
        "type": "contains",
        "patterns": [
          "Co-Authored-By: Claude",
          "Generated with Claude",
          "noreply@anthropic.com"
        ]
      },
      "action": "block",
      "message": "Do not add AI co-author or attribution trailers to commits. Rewrite the commit message with the trailer removed."
    }
  ]
}
```

Field by field:

- `appliesTo.tools: ["Bash"]` - only shell commands are checked; edits and
  writes never trip this rule.
- `commandMatch: ["commit"]` - the rule is only evaluated for commands that
  contain `commit` (case-insensitive). Deliberately broader than `git commit`
  so `git commit --amend` and `git -C some/path commit` are covered too.
- `trigger.contains` - fires when any pattern appears literally in the
  command, case-insensitive. Three patterns cover the trailer, the
  "Generated with" footer, and the Anthropic noreply address (which catches
  trailers that spell the model name differently).
- `action: "block"` - the agent's PreToolUse hook denies the command before
  it runs; the agent sees `message` as the denial reason and retries with a
  clean commit message.
- `message` - always tell the agent what to do instead, not just what it did
  wrong. That turns a denial into a one-retry fix.

What the agent sees when it fires:

```
[minos:no-claude-coauthor] Do not add AI co-author or attribution trailers
to commits. Rewrite the commit message with the trailer removed.
```

Test it without committing anything, straight through the engine:

```
echo '{"event":"command","tool":"Bash","command":"git commit -m \"fix\"","cwd":"."}' \
  | minos check
```

or paste a sample command into the test sandbox in `minos config --global`.
