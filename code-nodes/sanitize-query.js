// ─────────────────────────────────────────────────────────────────────────────
// SANITIZE SERPER QUERY
// n8n Code node — runs after Prep LinkedIn Lookup, before the AI Agent.
//
// Serper blocks queries that combine site:linkedin.com/in with role keywords
// (founder, CEO, cofounder) simultaneously. This node detects that pattern
// and rewrites the query to avoid the block.
//
// Simplified from original — same logic, less code.
// ─────────────────────────────────────────────────────────────────────────────

function isBlockedPattern(q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    s.includes('site:linkedin.com/in') &&
    /\b(founder|cofounder|ceo)\b/.test(s)
  );
}

return items.map(item => {
  const row     = item.json;
  const company = row.normalized_company || row.company_name || '';
  const domain  = row.domain || row.normalized_domain || '';
  let query     = row.primary_query || '';

  if (isBlockedPattern(query)) {
    // Rewrite: drop site: scoping, add linkedin as a keyword instead
    if (company && domain) {
      query = `"${company}" "${domain}" linkedin founder`;
    } else if (company) {
      query = `"${company}" linkedin founder`;
    } else if (domain) {
      query = `"${domain}" linkedin founder`;
    } else {
      query = 'linkedin founder';
    }
  }

  return {
    json: {
      ...row,
      primary_query: query,
    },
  };
});
