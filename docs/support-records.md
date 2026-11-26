# Support records (problem register)

Every question, problem report and contact message sent to UNRET is stored in PostgreSQL and kept
permanently, together with the whole conversation and the history of how it was handled.

## What is stored

| Table | What it holds |
|---|---|
| `SupportTicket` | One row per question/problem: number (`#1001`…), who sent it (account or guest name + email), category, kind, priority, status, who handles it, links to the job / request / payment, and the record fields below. |
| `SupportMessage` | Every message in the conversation: from the person, replies from the team, and internal notes (never shown to the person), with attachments. |
| `SupportTicketEvent` | The history: created, replies, notes, status / priority / assignment changes, reopened, solved by the person, closed automatically — who did it and when. |

Record fields on each ticket:

- `firstResponseAt` – first reply from the team that the person could see
- `resolvedAt`, `resolvedById` – when it was solved and by whom (a team member, or the person)
- `resolutionSummary` – **how it was solved**. The team must write it before marking a ticket solved or closed;
  it is also sent to the person.
- `closedAt` – when it was closed (by the team, or automatically 14 days after being solved with no new message)
- `reopenCount` – how many times the problem came back after being solved. A reopened ticket keeps its
  earlier resolution in the history.

## Nothing gets lost

- **The database refuses deletions.** Triggers block `DELETE` and `TRUNCATE` on all three tables and any change
  to a message's text or to the history. The only change allowed on a message/history row is clearing the link
  to an account that no longer exists. Closing an account keeps its tickets (the account is anonymised, not deleted).
- **Deliberate purges** (for example a legal end-of-retention job) must opt in inside a transaction:
  `SET LOCAL unret.allow_support_purge = 'on';`
- **Every export and every reading of a conversation for a case is written to the audit log.**

## Daily backups

`docker compose up` starts a `db-backup` service that saves the whole database to `./backups` every 24 hours
and keeps 30 days (`BACKUP_KEEP_DAYS`). The script is `scripts/backup-db.sh` and also works by hand:

```bash
PGHOST=localhost PGUSER=unret PGPASSWORD=unret PGDATABASE=unret BACKUP_DIR=./backups ./scripts/backup-db.sh --once
```

Restore (into an empty database):

```bash
pg_restore --no-owner -d unret backups/unret-YYYY-MM-DD-HHMM.dump
```

In production, also copy `./backups` somewhere else (another server or cloud storage such as S3) — a backup on
the same disk as the database does not protect against losing that disk. Managed databases (AWS RDS, Google Cloud SQL,
Azure, DigitalOcean…) offer automatic backups with point-in-time recovery; turn them on as well.

## For administrators (website → Administration)

- **Support** – the inbox for open tickets.
- **Problem register** – all tickets ever, with filters (dates, status, category, type, search inside messages),
  totals (open, solved, average first reply, average time to solve, how many came back) and **Export to Excel**.
- On each ticket: **How it was solved**, the **History**, and **Download record** (a text file with all details,
  every message including internal notes, and the history — useful for disputes, complaints or the authorities).

The register is available to roles with `tickets.manage` (Owner, Support, Moderator, Finance) or `audit.view` (Owner).
