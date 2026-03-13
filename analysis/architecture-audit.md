# Prospecting Automation Stack — Architecture Audit

_Analyzed: 2026-03-13 | Workflows: `pitchbook data grabber_LIdaisychain` + unnamed personalization workflow_

---

## A. Current Architecture Summary

### System-Wide Data Flow

```
PitchBook (web scraper)
    ↓  raw JSON file
Google Drive folder "web scrape" (16ebB43_K_Gtewxtlj4T_Zn0_iiXbIyo5)
    ↓  n8n polls hourly
┌─────────────────────────────────────────────────────────┐
│ WORKFLOW 1: pitchbook data grabber_LIdaisychain         │
│                                                         │
│  Download JSON file                                     │
│    → Extract text blob from JSON                        │
│    → Parse fields via regex (JS)                        │
│    → [GATE: email present?]                             │
│       YES → Write to "AutoAdded" tab (7 fields)         │
│           → LinkedIn lookup (AI Agent + Serper)         │
│           → Update same row with linkedin_url           │
│       NO  → SILENTLY DROPPED                            │
│    → Delete source file from Drive                      │
└─────────────────────────────────────────────────────────┘
    ↓  Google Sheet: Pitchbook_thematicResearch_Nov2025
    ↓  Tab: "AutoAdded" (hardcoded gid=1600426108)
┌─────────────────────────────────────────────────────────┐
│ WORKFLOW 2: Personalize + Campaign Loader (manual)      │
│                                                         │
│  Read all rows where Contacted = empty                  │
│    → [GATE: email present?]                             │
│       YES → Loop items                                  │
│           → Map key fields                              │
│           → AI Agent generates 2 personalization slugs  │
│           → Parse JSON output                           │
│           → Write to "Feb 16" tab (HARDCODED)           │
│           → Mark Contacted = ISO timestamp              │
│       NO  → SILENTLY DROPPED                            │
└─────────────────────────────────────────────────────────┘
    ↓  Google Sheet: Woodpecker_CampaignLoader
    ↓  Tab: "Feb 16" (hardcoded gid=141289358)
    ↓
Woodpecker / outbound email system
```

### Workflow 1 — Node-by-Node

| Step | Node | Input | Output | Notes |
|------|------|-------|--------|-------|
| 1 | Schedule Trigger | — | trigger | Hourly |
| 2 | Search files and folders | Drive folder ID | array of file metadata | Returns ALL files in folder |
| 3 | Download file | file.id | raw file bytes + metadata | Fans out to Extract AND Merge |
| 4 | Extract from File | bytes | `pitchbook_raw_text: {url, text}` | fromJson mode |
| 5 | Code in JavaScript | raw text | `{Company Name, Pitchbook, URL, First Name, Email, About, Date Added}` | Regex-based parser |
| 6 | If1 | `Email` field | true → nothing; false → Sheets | Drops no-email records |
| 7 | Append or update row in sheet1 | 7 fields | Sheets API response | Match key: Email; Cred: account 5 |
| 8 | Merge | [Sheets response, raw Download metadata] | merged item | combineByPosition — fragile |
| 9 | If | Email field | true → Loop; false → nothing | Redundant check |
| 10 | Loop Over Items | batch items | done / next item | SplitInBatches |
| 11 | (done) Delete a file | — | — | Uses `$('Download file').first().json.id` |
| 12 | Code in JavaScript1 | row | enriched row + query set | Skips existing LinkedIn |
| 13 | Code in JavaScript2 | row | sanitized query | Workaround for Serper blocks |
| 14 | Find LinkedIn URL | query | AI JSON output | GPT-4o-mini + Serper tool + memory |
| 15 | Normalize result | AI output string | `{email, linkedin_url}` | JSON.parse with fallback |
| 16 | Append or update row in sheet | `{email, linkedin_url}` | Sheets API response | Match key: Email; Cred: SendToWoodpeckerDB |
| 17 | → Loop | | | Continues |

### Workflow 2 — Node-by-Node

| Step | Node | Input | Output | Notes |
|------|------|-------|--------|-------|
| 1 | Manual Trigger | — | trigger | Must be clicked manually |
| 2 | Get row(s) in sheet | Sheet + filter | rows where Contacted = empty | Cred: account 4 — yet another credential |
| 3 | If | Email field | true → Loop; false → drop | LinkedIn-only leads dropped |
| 4 | Loop Over Items | batch items | done / next item | SplitInBatches |
| 5 | (done) | — | nothing | Loop done output unconnected |
| 6 | Mapping Key Fields | row | `{sheet_url, subject, email, sender_name, mail_id, About, First Name, Company Name, Founder Linkedin}` | `mail_id` hardcoded as "123456" |
| 7 | Session ID | items | items + sessionId | `Date.now()` — same for all items |
| 8 | AI Agent | lead fields | JSON string in `output` | GPT-4.1-mini; generates email+linkedin slugs |
| 9 | Parse personalized LinkedIn from Email | AI output | `{PersonalizedEmail, PersonalizedLinkedin}` | JSON.parse — no error handling |
| 10 | Merge | [AI output, Mapping Key Fields output] | combined | Standard merge |
| 11 | Prepare first message params | merged | passed through | EMPTY SET NODE — does nothing |
| 12 | Merge Paired outputs | merged stream | zipped pairs | Manual `items[i]` + `items[i+1]` pairing — very fragile |
| 13 | Append row in sheet | campaign fields | Sheets API response | Tab: "Feb 16" HARDCODED; Cred: SendToWoodpeckerDB |
| 14 | Append or update row in sheet | `{Email, Contacted}` | Sheets API response | Sets Contacted = ISO timestamp; Cred: account 7 |
| 15 | → Loop | | | Continues |

### Credentials in Use (across both workflows)

| Credential | Used by | Sheet |
|------------|---------|-------|
| Google Drive account 8 | Download, Delete file | Drive |
| Google Sheets account 5 | Write initial 7 fields | Pitchbook_thematicResearch |
| SendToWoodpeckerDB | Update LinkedIn, Append to campaign sheet | Both sheets |
| Google Sheets account 4 | Read uncontacted rows | Pitchbook_thematicResearch |
| Google Sheets account 7 | Mark Contacted | Pitchbook_thematicResearch |

**5 different credentials across 2 workflows touching the same 2 sheets.** This is unnecessary complexity and a fragility risk.

---

## B. Main Pain Points / Failure Points

### P1 — CRITICAL: Records Without Email Are Silently Dropped

Both workflows gate on `Email != empty`. Any lead PitchBook scrapes without an email address is:
- Never written to the source sheet
- Never looked up for LinkedIn
- Never sent to any campaign
- No log entry, no error, no record it ever existed

**Impact:** You're losing a large chunk of your TAM before you even see it. LinkedIn-only outreach is a valid, high-performing channel for the audience you're targeting.

### P2 — CRITICAL: LinkedIn Lookup Asks an LLM to Guess URLs

The prompt says _"Determine the most likely LinkedIn profile."_ GPT-4o-mini will fabricate plausible-looking `/in/` URLs when it isn't sure. The Serper tool is attached but the agent uses its own judgment about whether to call it.

**Impact:** Your `Founder Linkedin` column contains hallucinated URLs that will cause LinkedIn campaign failures you may not notice until you've sent messages to wrong people.

Fix: Rewrite the prompt to mandate tool use and validate the returned URL pattern. Better: extract the URL directly from Serper results in a Code node without the LLM making the decision.

### P3 — HIGH: Hardcoded Campaign Tab ("Feb 16")

The Woodpecker_CampaignLoader write node has `gid=141289358` ("Feb 16") hardcoded. Every run of Workflow 2 appends to that tab until you manually:
1. Create a new tab in the sheet
2. Open n8n and update the node to point to the new tab
3. Then run the workflow

This is the primary manual bottleneck you described.

### P4 — HIGH: Merge (combineByPosition) Is Structurally Wrong

In Workflow 1, the `Merge` node combines:
- Input 0: result from Sheets API write (1 response object)
- Input 1: raw file metadata from Drive download (could be N file objects)

`combineByPosition` zips these pairwise by array index. If 5 files are downloaded and 3 have emails, you get 3 Sheets responses merged with the first 3 Drive file objects. The resulting merged items contain **Sheets API response metadata** (updatedRows, updatedCells) mixed with file metadata — neither of which is the lead data.

**The data flowing into the LinkedIn lookup loop is the wrong shape entirely.** This works accidentally because the Gmail account 5 Sheets write returns enough context, but it's not reliably passing the lead record fields.

### P5 — HIGH: `URL` vs `Url` Field Name Inconsistency

The JavaScript parser (Code node) outputs field `'URL'` (uppercase). The Google Sheets schema defines column `'Url'` (mixed case). The write node maps `"Url": "={{ $json.URL }}"`.

This works *only* because you've manually wired the expression. If you ever use `mappingMode: "autoMapInputData"` or rename a column, the field silently stops writing.

### P6 — HIGH: Schema Has Both `Email` and `email` Columns

The `AutoAdded` tab schema defines both `Email` (id: "Email") and `email` (id: "email") as separate columns. The LinkedIn update step writes `"Email": "={{ $json.email }}"` — lowercase input field to uppercase column. Meanwhile the initial write uses `"Email": "={{ $json.Email }}"`.

This creates a schema drift risk and potentially two separate columns in your sheet with different capitalization.

### P7 — HIGH: Four Different Credentials for the Same Sheets

There is no technical reason for Google Sheets account 4, account 5, account 7, and SendToWoodpeckerDB to be separate credentials if they all access the same spreadsheet. Consolidate to one service account or one OAuth credential. More credentials = more token refresh failures = more random overnight breakages.

### P8 — MEDIUM: `Merge Paired outputs` Is Fragile Manual Pairing

Workflow 2 uses this code to join AI output with lead metadata:
```js
for (let i = 0; i < items.length; i += 2) {
  const body = items[i].json;    // AI output
  const meta = items[i + 1].json; // lead metadata
```

This assumes items arrive in perfectly alternating pairs. If the AI Agent fails on even one item, throws, or the Merge node emits items in a different order, **every subsequent item gets paired with the wrong lead**. You end up writing wrong personalization to wrong records.

### P9 — MEDIUM: `Prepare first message params` Is an Empty No-Op

The `Prepare first message params` Set node has zero assignments. It passes data through unchanged. It exists in the flow but does nothing. Delete it.

### P10 — MEDIUM: `mail_id` Hardcoded as `"123456"`

The `Mapping Key Fields` node sets `mail_id: "123456"`. This looks like a placeholder that was never replaced with actual logic. If this field feeds your outbound system, every lead has the same mail_id.

### P11 — MEDIUM: Simple Memory Is Pointless in Both Workflows

Both AI agents have `Simple Memory (memoryBufferWindow)` attached. In Workflow 1, each item generates a unique UUID sessionId so there is literally no memory being shared across calls. In Workflow 2, the sessionId is `Date.now()` (same for all items in the batch), so all items share a memory window — which means one record's personalization context bleeds into the next.

Remove Simple Memory from both agents. These are single-shot generation tasks, not conversations.

### P12 — MEDIUM: Loop Done Output Unconnected in Workflow 2

`Loop Over Items` output 0 (batch complete) is wired to nothing. There is no "after the batch is done" handler — no notification, no summary, no cleanup.

### P13 — LOW: Serper API Key Hardcoded in HTTP Request Node

The API key `9aee3eb060bd46678a2c6a7588be1223e6c3c5e0` is hardcoded in the node parameters as a header value. It's visible to anyone who exports the workflow JSON. Move to n8n credentials or environment variable.

---

## C. Proposed Target Architecture

### Design Principles

1. **One sheet, one credential** — Pitchbook_thematicResearch is the single source of truth. Access it with one credential.
2. **Never drop a lead** — Write all records regardless of email presence. Let the channel router decide what to do with them.
3. **Channel is a field, not a gate** — `channel` is computed once and stored on the record. Downstream logic reads that field.
4. **Tab naming is deterministic and automatic** — No human touches the workflow to create a new tab.
5. **LinkedIn lookup returns verified URLs only** — The LLM evaluates Serper results; it does not guess.

### Target Data Flow

```
PitchBook scraper
    ↓  JSON file
Google Drive "web scrape" folder
    ↓  n8n polls hourly (1 file per run)
┌──────────────────────────────────────────────────────────────┐
│ WORKFLOW 1 (Ingest + Enrich) — runs automatically            │
│                                                              │
│  Download file                                               │
│    → Parse all fields (regex) + add batch_id (ISO week)      │
│    → Write ALL records to source sheet                       │
│      (upsert by Pitchbook URL — always present, always unique)│
│    → LinkedIn enrichment loop (all records, email or not)    │
│      → skip if linkedin_url already present                  │
│      → Serper search → LLM evaluates results → store URL     │
│    → Delete source file                                      │
└──────────────────────────────────────────────────────────────┘
    ↓  Source sheet: Pitchbook_thematicResearch
    ↓  Single tab (not weekly — see section E)
    ↓  Fields: company_name, pitchbook_url, website_url,
    ↓          first_name, email, linkedin_url, about,
    ↓          date_added, batch_id, channel, contacted_at
┌──────────────────────────────────────────────────────────────┐
│ WORKFLOW 2 (Personalize + Route) — triggered manually        │
│                                                              │
│  Read uncontacted records                                    │
│    → Compute channel per record (see section D)              │
│    → Filter out channel = 'none'                             │
│    → Ensure this week's tab exists in Woodpecker sheet       │
│    → Loop over contactable records                           │
│       → email_linkedin: AI personalization → campaign row    │
│       → linkedin_only:  campaign row (no email personalization)│
│       → email_only:     AI personalization → campaign row    │
│    → Mark contacted_at in source sheet                       │
└──────────────────────────────────────────────────────────────┘
    ↓  Campaign sheet: Woodpecker_CampaignLoader
    ↓  Tab: auto-created "W2026-11" (ISO week)
    ↓  Fields: email, linkedin_url, first_name, company,
    ↓          personalized_email, personalized_linkedin,
    ↓          channel, batch_id
    ↓
Woodpecker / outbound
```

### Source Sheet Schema (canonical)

The `AutoAdded` tab should have exactly these columns, in this order:

| Column | Type | Notes |
|--------|------|-------|
| `pitchbook_url` | string | **Primary key** — always present |
| `company_name` | string | |
| `website_url` | string | |
| `first_name` | string | |
| `email` | string | May be empty |
| `linkedin_url` | string | May be empty; filled by Workflow 1 |
| `about` | string | |
| `date_added` | string | YYYY-MM-DD |
| `batch_id` | string | ISO week e.g. `W2026-11` |
| `channel` | string | `email_linkedin` / `linkedin_only` / `email_only` / `none` |
| `contacted_at` | string | ISO timestamp, empty until contacted |

**Breaking change:** Renaming columns will require updating the write nodes. Do it once cleanly rather than layering new columns on top of old ones.

### Campaign Sheet Schema (canonical)

Woodpecker_CampaignLoader tabs should have exactly these columns:

| Column | Type | Notes |
|--------|------|-------|
| `email` | string | May be empty for linkedin_only |
| `linkedin_url` | string | May be empty for email_only |
| `first_name` | string | |
| `company` | string | |
| `personalized_email` | string | Empty for linkedin_only |
| `personalized_linkedin` | string | Empty for email_only |
| `channel` | string | For filtering in Woodpecker |
| `batch_id` | string | For traceability |

---

## D. Branching Logic for Campaign Segmentation

### Channel Determination (runs in Workflow 1 after enrichment, and again in Workflow 2)

```js
// code-nodes/channel-router.js
function isLinkedInProfileUrl(s) {
  if (!s) return false;
  const v = String(s).toLowerCase().trim();
  return v.includes('linkedin.com/in/') || v.includes('linkedin.com/pub/');
}

function getChannel(record) {
  const hasEmail = !!(record.email || '').trim();
  const hasLinkedIn = isLinkedInProfileUrl(record.linkedin_url);

  if (hasEmail && hasLinkedIn)  return 'email_linkedin';
  if (hasLinkedIn && !hasEmail) return 'linkedin_only';
  if (hasEmail && !hasLinkedIn) return 'email_only';
  return 'none';
}
```

### Decision Table

| Email | LinkedIn | Channel | Campaign Action |
|-------|----------|---------|-----------------|
| ✓ | ✓ | `email_linkedin` | Full sequence: email touch 1→2→3 + LinkedIn connect/message |
| ✗ | ✓ | `linkedin_only` | LinkedIn connect + follow-up message only |
| ✓ | ✗ | `email_only` | Email sequence only; optionally trigger LinkedIn search again later |
| ✗ | ✗ | `none` | Do not send to campaign; store in source sheet for review |

### How to Implement the Route in n8n

Use a **Switch node** after the channel router code node. Switch on `{{ $json.channel }}`:

- Output 0: `email_linkedin` → AI personalization node → append to campaign sheet (channel field = "email_linkedin")
- Output 1: `linkedin_only` → skip AI personalization (no email needed) → append to campaign sheet (channel = "linkedin_only", email field empty)
- Output 2: `email_only` → AI personalization node (email slug only; linkedin field = "") → append to campaign sheet
- Output 3: `none` → do not append; optionally write to a "review" log

After the Switch branches, merge all non-none outputs back together with a **Merge node** before the `Mark Contacted` step. This way only one Sheets write marks the lead as contacted, regardless of channel.

### AI Personalization — What Changes

For `linkedin_only` records, you don't need the `email` personalization slug. You only need the `linkedin` space phrase. Update the AI Agent prompt to be conditional:

```
If channel is "email_linkedin" or "email_only":
  generate both "email" and "linkedin" fields

If channel is "linkedin_only":
  generate only "linkedin" field; return "email" as ""
```

Or simplify: always generate both fields, use what you need. The cost difference on GPT-4.1-mini is negligible.

### Output Structure in Campaign Sheet

Each row written to the campaign tab should include a `channel` column. This lets you filter in Woodpecker:
- Import only rows where `channel = email_linkedin` into your multi-touch campaign
- Import only rows where `channel = linkedin_only` into your LinkedIn-only sequence

---

## E. Recommendation for Sheet/Tab Automation

### The Two Options

**Option A: Weekly tabs in Woodpecker_CampaignLoader**
- Auto-create a tab named `W2026-11` (ISO year + week number) at the start of each Workflow 2 run
- Write that week's records to that tab
- Pros: easy to browse historically; clean separation per batch
- Cons: schema drift between tabs if columns ever change; Woodpecker imports require knowing the tab name

**Option B: Single table with `batch_id` column**
- All campaign records in one tab
- `batch_id` = `W2026-11` (or a run date)
- Filter in Woodpecker by `batch_id` to get that week's records
- Pros: one schema; easy to query; no tab proliferation; import filter handles segmentation
- Cons: tab gets long over time; requires Woodpecker to support column filtering on import

**Recommendation: Option B (single table + batch_id) for the campaign sheet, with a weekly summary view as a secondary tab if needed.**

Rationale: Woodpecker and most email senders can filter CSV imports by a column value. Having one canonical schema in one tab means you never have a mismatch between old and new tabs. The `batch_id` field gives you the same segmentation you'd get from separate tabs, without the manual overhead.

If you insist on Option A (weekly tabs), here is how to implement auto-creation in n8n:

### Auto Tab Creation (Option A implementation)

**Step 1: Compute tab name**
```js
// code-nodes/get-weekly-tab-name.js
function getISOWeekLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `W${d.getFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

return [{ json: { tabName: getISOWeekLabel(new Date()) } }];
// Outputs: { tabName: "W2026-11" }
```

**Step 2: Create tab via Google Sheets API**

Add an HTTP Request node after the tab name code node:
- Method: POST
- URL: `https://sheets.googleapis.com/v4/spreadsheets/1ajOrUzEcfJ3IWvS9ByaFX57VqGA80wh4VCdBPqQAGd0/batchUpdate`
- Authentication: Predefined Credential Type → Google Sheets OAuth2 (use same credential as campaign sheet write)
- Body (JSON):
```json
{
  "requests": [{
    "addSheet": {
      "properties": {
        "title": "={{ $('Get Tab Name').first().json.tabName }}"
      }
    }
  }]
}
```
- Enable **"Continue on Fail"** on this node — if the tab already exists, the API returns a 400 error, which is normal and should not stop the workflow.

**Step 3: Write to dynamic tab**

In the Google Sheets append node, set:
```
sheetName: { mode: "name", value: "={{ $('Get Tab Name').first().json.tabName }}" }
```

This dynamically resolves the tab name without hardcoding.

---

## F. Step-by-Step Implementation Plan

### Priority 1 — Fix data loss immediately (1–2 hours)

1. **Remove email gate in Workflow 1**: Delete the `If1` node. Wire `Code in JavaScript` output directly to `Append or update row in sheet1`. Change the match key from `Email` to `Pitchbook` (URL — always present). Now all records land in the sheet.

2. **Fix the Merge (combineByPosition) hack**: Delete the `Merge` node and the downstream `If` node. The loop should receive the original parsed lead records, not mangled Sheets API responses. Wire `Append or update row in sheet1` output into `Loop Over Items` directly.

3. **Remove email gate in Workflow 2**: Delete the `If` node. All records with any contact channel should proceed.

4. **Fix `URL` → `Url` field name**: In the Code node parser, change `'URL'` to `'Url'` to match the schema.

### Priority 2 — Add channel routing (2–3 hours)

5. **Add channel router code node in Workflow 1**: After writing to source sheet, before the loop, add a Code node that assigns the `channel` field using the logic in section D. Store `channel` in the sheet.

6. **Add Switch node in Workflow 2**: Replace the single If-email gate with a Switch node routing on `channel`. Wire outputs per section D.

7. **Remove `Prepare first message params` empty node**: Delete it.

8. **Fix `Merge Paired outputs` fragile pairing**: Replace the manual `items[i]` + `items[i+1]` zip with n8n's built-in Merge node in "combine by position" mode, or better yet, ensure AI output flows back through the same item using the Set node (so you never need to merge two separate streams).

### Priority 3 — Fix tab automation (1–2 hours)

9. **Add `Get Tab Name` code node** at the start of Workflow 2 (see section E).
10. **Add `Create Tab if Not Exists` HTTP Request node** (see section E) with Continue on Fail.
11. **Update campaign sheet append node** to use dynamic tab name expression.
12. **Optionally: add `batch_id` column** to campaign sheet schema.

### Priority 4 — Reduce credential sprawl (1 hour)

13. **Consolidate Google Sheets credentials**: Pick one service account or OAuth credential for all Sheets access. Update all 4 Sheets credentials in both workflows to the same credential.

### Priority 5 — Fix LinkedIn lookup reliability (2–3 hours)

14. **Rewrite LinkedIn agent prompt** to require Serper tool call and extract URL from search results rather than guessing. See `code-nodes/prep-linkedin-lookup.js` for the improved prompt.
15. **Remove Simple Memory** from both AI agents.
16. **Move Serper API key** to n8n credentials store (HTTP Header Auth credential type).

### Priority 6 — Clean up (1 hour)

17. **Fix `mail_id` hardcoded "123456"**: Replace with a real identifier or remove if unused.
18. **Rename source sheet columns** to match canonical schema (section C). Do this in the sheet first, then update all node mappings.

---

## G. Specific Code/Workflow Changes

See the `/code-nodes/` directory for all JavaScript code nodes as standalone files, and `/workflows/` for the full refactored n8n workflow JSON exports.

### Key changes in `parse-pitchbook.js`

- Added `batch_id` field (ISO week label)
- Changed `'URL'` to `'website_url'` (consistent with canonical schema)
- Changed `'Pitchbook'` to `'pitchbook_url'`
- Changed `'Company Name'` to `'company_name'`
- Changed `'First Name'` to `'first_name'`
- Changed `'Email'` to `'email'`
- Changed `'About'` to `'about'`
- Changed `'Date Added'` to `'date_added'`

> **Note:** Column renames require updating the sheet headers first. Do that once and all future writes are correct.

### Key changes in `prep-linkedin-lookup.js`

- Uses `pitchbook_url` as session context (not email — email may be absent)
- Removed complex multi-query ladder; simplified to 2–3 clean Serper queries
- Prompt now instructs LLM to: (1) call the Serper tool, (2) evaluate returned URLs for validity, (3) return empty string if no confident match

### Key changes in Workflow 1 connections

```
BEFORE:
Code → If1 → (email present) → Sheets → Merge → If → Loop
                                       ↑
                          Download ────┘

AFTER:
Code → Sheets (all records, key=pitchbook_url) → Loop
```

### Key changes in Workflow 2 connections

```
BEFORE:
Get rows → If (email gate) → Loop → Map fields → SessionID → AI → Parse → Merge → empty Set → zip Code → Append → Mark contacted → Loop

AFTER:
Get rows → Loop → Channel router → Switch
                                    ├ email_linkedin → AI personalize → Merge branches → Append → Mark contacted → Loop
                                    ├ linkedin_only  ─────────────────→ Merge branches → Append → Mark contacted → Loop
                                    ├ email_only  → AI personalize  → Merge branches → Append → Mark contacted → Loop
                                    └ none → (no append, no mark contacted) → Loop
```

---

## H. Assumptions, Risks, and Edge Cases

### Assumptions Made

1. PitchBook scraper always produces one JSON file per run and deposits it in the Drive folder. Multiple simultaneous files are rare. (Workflow 1 processes one file at a time via hourly schedule.)
2. The `pitchbook_url` field is always present and unique per record. If it's not, use a composite key: `company_name + date_added`.
3. LinkedIn enrichment is best-effort. Records that don't get a LinkedIn URL are still written to the campaign sheet with `channel = email_only` (if they have email) or `none` (if they have neither).
4. The Woodpecker import workflow can filter by a column value (e.g., `channel` or `batch_id`). If it cannot, use weekly tabs.

### Risks

1. **Column rename migration**: Renaming sheet columns is a one-way operation. If you rename while live leads are in the sheet, any workflows still using old column names will write to the wrong columns or fail. Migration plan: rename columns in sheet → update all write nodes → run test with 1 record.

2. **Serper rate limits**: LinkedIn lookup processes every record in the batch. For large batches (50+ records), you may hit Serper's rate limit. Add a `Wait` node (1–2 seconds) between loop iterations.

3. **AI personalization JSON parse failures**: The current `JSON.parse($json.output)` fails hard on malformed output. Wrap in try/catch and fall back to default slugs ("Your work in this space stood out to us." and "your sector") rather than crashing the loop.

4. **Google Sheets API tab creation race condition**: If Workflow 2 is triggered twice simultaneously (unlikely with manual trigger), both runs may try to create the same tab. The second will get a 400 error. With "Continue on Fail" enabled, this is safe.

5. **LinkedIn-only campaign infrastructure**: Before routing records to `linkedin_only`, confirm that your Woodpecker/outbound setup actually supports a LinkedIn-only sequence. If it doesn't, treat `linkedin_only` as `none` temporarily.

6. **PitchBook scraper reliability**: The regex-based parser in `Code in JavaScript` assumes a specific text format. If PitchBook changes their export format, all fields can silently fail to extract. Consider adding a validation step that checks for at least `company_name` before writing.

### What to Scrap Entirely

- **The `Merge (combineByPosition)` hack** — delete it
- **The `Prepare first message params` empty node** — delete it
- **`Simple Memory` on both AI agents** — remove it
- **`Merge Paired outputs` manual zip code** — replace with n8n's built-in Merge or restructure so AI output stays on the same item
- **4 separate Google Sheets credentials** — consolidate to 1
- **`mail_id: "123456"`** — remove or replace with real logic
