// ─────────────────────────────────────────────────────────────────────────────
// PARSE PITCHBOOK
// n8n Code node — place this in the "Code in JavaScript" node that follows
// "Extract from File".
//
// Changes from original:
//   - All fields use canonical snake_case names matching the source sheet schema
//   - Adds batch_id (ISO week label, e.g. "W2026-11")
//   - Fixes URL/Url case inconsistency
//   - Filters pitchbook.com URLs from website field
//   - Never drops a record — email absence is fine
// ─────────────────────────────────────────────────────────────────────────────

function getISOWeekLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `W${d.getFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function cleanWebsite(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // Ignore PitchBook-internal links
  if (s.toLowerCase().includes('pitchbook.com')) return '';
  return s;
}

return items.map(item => {
  const pb  = item.json.pitchbook_raw_text || {};
  const text = (pb.text || '').toString();
  const pitchbookUrl = (pb.url || '').trim();

  // Company name = first non-empty line
  const companyName = text.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';

  // Website
  const websiteMatch = text.match(/Website\s+([^\n]+)/i);
  const websiteRaw   = websiteMatch ? websiteMatch[1].trim() : '';
  const websiteUrl   = cleanWebsite(websiteRaw);

  // About / Description — grab block until next section header
  const descMatch = text.match(
    /Description\s+([\s\S]*?)(?:\nMost Recent Financing Status|\nWebsite|\nEmployees|\nPrimary Contact)/i
  );
  const about = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Primary contact / first name
  const primaryContactMatch = text.match(/Primary Contact\s+([^\n]+)/i);
  const primaryContact = primaryContactMatch ? primaryContactMatch[1].trim() : '';
  const firstName = primaryContact ? primaryContact.split(/\s+/)[0] : '';

  // First email found anywhere in the text
  const emailMatch = text.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : '';

  const today   = new Date();
  const dateAdded = today.toISOString().split('T')[0];
  const batchId   = getISOWeekLabel(today);

  return {
    json: {
      pitchbook_url: pitchbookUrl,
      company_name:  companyName,
      website_url:   websiteUrl,
      first_name:    firstName,
      email:         email,
      linkedin_url:  '',        // filled later by LinkedIn enrichment
      about:         about,
      date_added:    dateAdded,
      batch_id:      batchId,
      channel:       '',        // filled after enrichment
      contacted_at:  '',        // filled by Workflow 2
    },
  };
});
