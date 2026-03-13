// ─────────────────────────────────────────────────────────────────────────────
// MERGE AI PERSONALIZATION
// n8n Code node — runs after the AI Agent (personalization) in Workflow 2.
//
// Why this exists:
//   The original workflow used a fragile manual pairwise zip:
//     items[i] = AI output,  items[i+1] = lead metadata
//   If the AI failed on one item the pairing shifted and all subsequent
//   records got the wrong data.
//
// This approach is different: the AI output ($json.output) lands on the SAME
// item that already has all the lead fields. The Set node that calls the AI
// passes lead fields through, so when the AI responds the item already contains
// company_name, email, etc.
//
// This code node simply parses the AI JSON output and promotes the two
// personalization fields onto the item. No merging of separate streams needed.
// ─────────────────────────────────────────────────────────────────────────────

function parsePersonalization(raw) {
  if (!raw) return { email: '', linkedin: '' };
  const cleaned = String(raw).replace(/```json|```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    return {
      email:    (obj.email    || '').trim(),
      linkedin: (obj.linkedin || '').trim(),
    };
  } catch {
    // Return safe defaults — never crash the loop
    return {
      email:    'Your work in this space stood out to us.',
      linkedin: 'your sector',
    };
  }
}

return items.map(item => {
  const p = parsePersonalization(item.json.output);

  return {
    json: {
      ...item.json,
      personalized_email:    p.email,
      personalized_linkedin: p.linkedin,
      // Remove the raw AI output blob — not needed downstream
      output: undefined,
    },
  };
});
