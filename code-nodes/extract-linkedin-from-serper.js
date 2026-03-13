// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT LINKEDIN FROM SERPER RESULTS
// n8n Code node — replaces the AI Agent entirely for LinkedIn lookup.
//
// Input:  Serper API response JSON (from a direct HTTP Request node)
//         plus the original lead fields passed through
// Output: { ...lead fields, linkedin_url: "https://..." or "" }
//
// Logic:
//   1. Pull all linkedin.com/in/ URLs out of organic search results
//   2. Score each candidate by how well it matches the target person
//   3. Return the best match — only if score is positive (name/company match)
//   4. Return empty string if no confident match
//
// Why no LLM here:
//   URL extraction from search results is deterministic. An LLM adds
//   hallucination risk and can pick famous people (Reid Hoffman) over the
//   actual target. A scoring function is faster, cheaper, and more reliable.
// ─────────────────────────────────────────────────────────────────────────────

const serperResponse = $input.first().json;

// Lead fields were passed through on the item before the HTTP call.
// Reference them from the upstream prep node.
const lead = $('Prep LinkedIn Lookup').first().json;

const firstName   = (lead.first_name    || '').toLowerCase().trim();
const companyName = (lead.company_name  || '').toLowerCase().trim();
const domainRaw   = (lead.domain        || '').toLowerCase().trim();
// e.g. "acme.com" → "acme"
const domainToken = domainRaw.split('.')[0];

// ── 1. Collect all linkedin.com/in/ candidates from results ─────────────────

const organic   = serperResponse.organic   || [];
const knowledge = serperResponse.knowledgeGraph ? [serperResponse.knowledgeGraph] : [];
const allResults = [...organic, ...knowledge];

const candidates = [];
for (const r of allResults) {
  const url     = (r.link || r.website || '').trim();
  const title   = (r.title   || r.description || '').toLowerCase();
  const snippet = (r.snippet || '').toLowerCase();

  if (url.toLowerCase().includes('linkedin.com/in/')) {
    candidates.push({ url, text: `${title} ${snippet}` });
  }
}

// ── 2. Score each candidate ──────────────────────────────────────────────────

function score(candidate) {
  const t = candidate.text;
  let s = 0;

  // Positive signals: name and company appear near the URL
  if (firstName   && t.includes(firstName))   s += 4;
  if (companyName && t.includes(companyName)) s += 3;
  if (domainToken && t.includes(domainToken)) s += 2;

  // Hard penalise known false-positive patterns
  // Reid Hoffman / LinkedIn corporate results flood founder searches
  if (t.includes('reid hoffman'))                          s -= 20;
  if (candidate.url.toLowerCase().includes('reidhoffman')) s -= 20;
  if (t.includes('co-founder of linkedin'))               s -= 20;
  if (t.includes('linkedin corporation'))                 s -= 10;

  // Penalise if the URL slug looks like a company page not a person
  // linkedin.com/in/ should always be a person — /company/ is filtered above
  // but double-check the URL slug doesn't match a generic term
  if (candidate.url.toLowerCase().includes('/in/linkedin')) s -= 10;

  return s;
}

candidates.sort((a, b) => score(b) - score(a));

const best      = candidates[0];
const bestScore = best ? score(best) : -99;

// Only accept if there is a positive signal — at least name OR company matched
const linkedInUrl = (best && bestScore > 0) ? best.url : '';

return [{
  json: {
    pitchbook_url: lead.pitchbook_url || '',
    email:         lead.email         || '',
    linkedin_url:  linkedInUrl,
    // Debug fields — remove these once you've confirmed it's working
    _debug_candidates_found: candidates.length,
    _debug_best_score:       bestScore,
    _debug_best_url:         best ? best.url : '',
  },
}];
