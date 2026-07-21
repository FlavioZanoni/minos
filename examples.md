# Examples

Every rule below has been run through the real engine; the outputs shown are
actual engine output, not mockups. To try one yourself with no install, pipe a
`check` payload through `npx -y github:FlavioZanoni/minos check` (shown at the
end of the first example).

## Block destructive filesystem commands

The class of incident everyone has read a horror story about: an agent runs a
recursive force delete against the wrong path and the damage is done before
anyone can react. In one widely reported case an unquoted `rm -rf ~` expanded
to the user's real home directory and wiped the machine. This rule makes the
ban mechanical, for free, with zero model calls.

```jsonc
{
  "id": "no-destructive-commands",
  "summary": "Block recursive force deletes",
  "appliesTo": { "tools": ["Bash"] },
  "trigger": { "type": "regex", "patterns": ["rm\\s+-[a-z]*r[a-z]*f", "rm\\s+-[a-z]*f[a-z]*r"] },
  "action": "block",
  "message": "Recursive force deletes are blocked. Delete specific files by name, or ask the user to run this themselves."
}
```

- The two patterns cover both flag orders (`-rf`, `-fr`) and combined flags
  (`-vrf`), case-sensitively, as regex rules always are.
- Deliberately opinionated: it also blocks legitimate uses like
  `rm -rf node_modules`. That is the point of a hard rule; the message tells
  the agent the escape hatch (delete by name, or hand it to the human).
  Narrow the patterns if your workflow needs agent-driven `rm -rf`.

Verified through the engine:

```
rm -rf /tmp/build-cache  -> block (no-destructive-commands)
rm -fr ./dist            -> block (no-destructive-commands)
rm old-notes.txt         -> allow
```

## Protect production systems

The famous version of this incident: an agent deleted a production database
during an active code freeze, despite receiving repeated instructions not to
make changes. Instructions are not enforcement. No keyword list can decide
"is this production?" reliably, so this is the rule where `llm-judge` earns
its cost: a narrow yes/no question, asked only when the command looks
suspicious.

```jsonc
{
  "id": "protect-production",
  "summary": "AI check before commands that might touch shared or production systems",
  "appliesTo": { "tools": ["Bash"], "commandMatch": ["deploy", "prod", "migrate", "psql", "mysql", "drop", "truncate"] },
  "trigger": {
    "type": "llm-judge",
    "promptText": "Would this shell command modify a shared or production system: deploying, running or reverting migrations, or writing/deleting data in a database that is not clearly local? FAIL if yes or if the target is unclear. PASS only if it is clearly local development."
  },
  "action": "warn",
  "message": "This command may touch a shared or production system. Confirm the target environment with the user before running it."
}
```

- `commandMatch` is the cost gate: the judge model is only invoked when the
  command contains one of those substrings. Everything else never leaves the
  deterministic path.
- The prompt fails on "unclear", not just on "yes". An env-var database URL
  could point anywhere; unclear targets deserve a pause.
- Shipped as `warn` on purpose. Watch the false-positive rate in the config
  UI's test sandbox, then promote to `block` when you trust it.

Verified through the engine, real judge model:

```
psql $DATABASE_URL -c "TRUNCATE TABLE users CASCADE"
  -> warn (protect-production): "$DATABASE_URL is unclear whether it points
     to a local or production database, and TRUNCATE destructively deletes
     all data from a table."

docker compose -f docker-compose.local.yml exec db psql -U dev -d myapp_dev \
  -c "select count(*) from users"
  -> allow (judge recognized clearly local development)
```

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
  | npx -y github:FlavioZanoni/minos check
```

or paste a sample command into the test sandbox in the config UI
(`npx -y github:FlavioZanoni/minos config --global`).
