// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZE LINKEDIN RESULT
// n8n Code node — runs after the AI Agent (Find LinkedIn URL).
//
// Changes from original:
//   - Wraps JSON.parse in try/catch — never crashes the loop
//   - Returns empty linkedin_url on failure instead of throwing
//   - Validates that the returned URL is actually a /in/ profile URL
//   - Preserves the pitchbook_url (needed as upsert key for sheet update)
// ─────────────────────────────────────────────────────────────────────────────

function isValidLinkedInProfile(s) {
  if (!s) return false;
  const v = String(s).toLowerCase().trim();
  return v.includes('linkedin.com/in/') || v.includes('linkedin.com/pub/');
}

function parseAgentOutput(raw) {
  if (!raw) return null;
  // Strip markdown fences if present
  const cleaned = String(raw).replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

return items.map(item => {
  const raw = item.json.output || '';
  const obj = parseAgentOutput(raw);

  const linkedInUrl = obj && isValidLinkedInProfile(obj.linkedin_url)
    ? obj.linkedin_url.trim()
    : '';

  return {
    json: {
      // Pass through identity fields needed for sheet upsert
      pitchbook_url: item.json.pitchbook_url || '',
      email:         item.json.email         || '',
      linkedin_url:  linkedInUrl,
    },
  };
});
