/**
 * Coalesce & Normalize
 *
 * PURPOSE
 * -------
 * Placed between "Rejoin Contactable Channels" and "Append to Campaign Tab".
 * Fixes two problems that occur together:
 *
 * Problem 1 — Duplicate items from AI LLM Chain node
 *   The n8n LLM Chain node emits TWO items per input:
 *     Item A: { output: "<AI JSON string>" }          ← AI result, no prospect fields
 *     Item B: { row_number, company_name, Email, ... } ← original lead, output already consumed
 *   After Parse Personalization runs on both:
 *     Item A becomes: { personalized_email: "...", personalized_linkedin: "" }
 *     Item B becomes: { row_number, ..., personalized_email: "", personalized_linkedin: "" }
 *   Result: 2 rows written to Sheets for 1 lead.
 *   Fix: merge all items into one, keeping the first non-empty value per field.
 *
 * Problem 2 — Non-canonical field names from source sheet
 *   The AutoAdded source sheet uses human-readable headers (Email, Founder Linkedin, etc.)
 *   but downstream nodes and the Sheets write expect canonical snake_case names.
 *   Fix: rename after merging.
 */

// Step 1: Coalesce — merge all items, first non-empty value wins per key
const merged = {};
for (const item of items) {
  for (const [k, v] of Object.entries(item.json)) {
    if (!(k in merged)) {
      merged[k] = v;
    } else if ((merged[k] === '' || merged[k] === null || merged[k] === undefined) &&
               v !== '' && v !== null && v !== undefined) {
      merged[k] = v;
    }
  }
}

// Step 2: Normalize — rename non-canonical headers to canonical names.
// Only renames if the canonical name isn't already populated.
const fieldMap = {
  'Pitchbook':        'pitchbook_url',
  'Url':              'website_url',
  'Email':            'email',
  'Founder Linkedin': 'linkedin_url',
  'About':            'about',
  'Date Added':       'date_added',
  'Contacted':        'contacted_at',
};
for (const [old, canonical] of Object.entries(fieldMap)) {
  if (old in merged) {
    if (!(canonical in merged) || merged[canonical] === '' || merged[canonical] === null) {
      merged[canonical] = merged[old];
    }
    delete merged[old];
  }
}

return [{ json: merged }];
