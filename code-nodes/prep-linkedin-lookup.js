// ─────────────────────────────────────────────────────────────────────────────
// PREP LINKEDIN LOOKUP
// n8n Code node — runs per item inside the LinkedIn enrichment loop.
//
// Changes from original:
//   - Works on ALL records (no email requirement)
//   - Uses pitchbook_url as session context key (not email)
//   - Simplified query ladder: 3 clean queries instead of 5
//   - Skips records that already have a valid LinkedIn /in/ URL
//   - Uses canonical field names (snake_case)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeDomain(input) {
  if (!input) return '';
  let s = String(input).trim();
  if (s.toLowerCase().includes('pitchbook.com')) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return (u.hostname || '').toLowerCase().replace(/^www\./, '');
  } catch {
    return s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function isValidLinkedInProfile(s) {
  if (!s) return false;
  const v = String(s).toLowerCase().trim();
  return v.includes('linkedin.com/in/') || v.includes('linkedin.com/pub/');
}

function generateSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

return items
  .map(item => {
    const row = item.json;

    // Skip if LinkedIn already found
    if (isValidLinkedInProfile(row.linkedin_url || row['Founder Linkedin'])) return null;

    // Support both canonical snake_case names and legacy sheet column names
    const company   = (row.company_name  || row['Company Name']  || '').trim();
    const firstName = (row.first_name    || row['First Name']    || '').trim();
    const email     = (row.email         || row['Email']         || '').trim();

    // Prefer website domain; fall back to email domain
    const websiteDomain = normalizeDomain(row.website_url || row['Url']);
    const emailDomain   = email.includes('@') ? normalizeDomain(email.split('@')[1]) : '';
    const domain        = websiteDomain || emailDomain;

    // Build 3 query variants, strictest first
    const queries = [];
    if (firstName && company) {
      queries.push(`"${firstName}" "${company}" site:linkedin.com/in`);
    }
    if (firstName && domain) {
      queries.push(`"${firstName}" "${domain}" site:linkedin.com/in`);
    }
    if (company) {
      queries.push(`"${company}" founder OR CEO site:linkedin.com/in`);
    }

    const primaryQuery = queries[0] || `${company} founder LinkedIn`;

    return {
      json: {
        ...row,
        // Lookup context
        normalized_company: company,
        normalized_domain:  domain,
        domain,
        needs_lookup:       true,
        // Query set
        primary_query:      primaryQuery,
        queries,
        // Session for AI agent (not shared across items)
        sessionId:          generateSessionId(),
      },
    };
  })
  .filter(Boolean);
