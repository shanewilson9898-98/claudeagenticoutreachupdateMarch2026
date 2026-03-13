// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL LEAD SCHEMA
//
// Single source of truth for field names across both workflows and both sheets.
// When you rename a column in Google Sheets, update it here first, then find
// every reference with: grep -r "FIELD_NAME" code-nodes/ workflows/
//
// Source sheet:  Pitchbook_thematicResearch_Nov2025 → AutoAdded tab
// Campaign sheet: Woodpecker_CampaignLoader → W{YYYY}-{WW} tab (auto-created)
// ─────────────────────────────────────────────────────────────────────────────

// ── SOURCE SHEET COLUMNS (in order) ─────────────────────────────────────────
//
// These are the exact column header strings in the Google Sheet.
// All workflow write nodes must use these exact names.
//
const SOURCE_SHEET_COLUMNS = [
  'pitchbook_url',    // primary key — always present; unique per company
  'company_name',
  'website_url',
  'first_name',
  'email',            // may be empty
  'linkedin_url',     // may be empty; filled by Workflow 1 enrichment
  'about',
  'date_added',       // YYYY-MM-DD
  'batch_id',         // ISO week label e.g. W2026-11
  'channel',          // email_linkedin | linkedin_only | email_only | none
  'contacted_at',     // ISO timestamp | empty until Workflow 2 runs
];

// ── CAMPAIGN SHEET COLUMNS (in order) ───────────────────────────────────────
//
// Written to Woodpecker_CampaignLoader by Workflow 2.
// Tab name is auto-created as W{YYYY}-{WW}.
//
const CAMPAIGN_SHEET_COLUMNS = [
  'email',                  // empty for linkedin_only
  'linkedin_url',           // empty for email_only
  'first_name',
  'company',
  'personalized_email',     // AI-generated slug; empty for linkedin_only
  'personalized_linkedin',  // AI-generated phrase (≤30 chars); empty for email_only
  'channel',                // for filtering in Woodpecker
  'batch_id',               // for traceability
];

// ── CHANNEL VALUES ───────────────────────────────────────────────────────────
const CHANNEL = {
  EMAIL_LINKEDIN: 'email_linkedin',
  LINKEDIN_ONLY:  'linkedin_only',
  EMAIL_ONLY:     'email_only',
  NONE:           'none',
};

// ── FIELD OWNERSHIP ──────────────────────────────────────────────────────────
//
// Field          Written by           Notes
// ──────────────────────────────────────────────────────────────────────────
// pitchbook_url  Workflow 1 (parse)   Upsert key — never changes
// company_name   Workflow 1 (parse)
// website_url    Workflow 1 (parse)
// first_name     Workflow 1 (parse)
// email          Workflow 1 (parse)   May be empty
// linkedin_url   Workflow 1 (enrich)  May be empty after enrichment
// about          Workflow 1 (parse)
// date_added     Workflow 1 (parse)
// batch_id       Workflow 1 (parse)   ISO week of ingestion
// channel        Workflow 1 (router)  Recomputed each run
// contacted_at   Workflow 2           Set when record enters campaign

module.exports = { SOURCE_SHEET_COLUMNS, CAMPAIGN_SHEET_COLUMNS, CHANNEL };
