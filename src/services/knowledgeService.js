const db = require('../db');

/**
 * knowledgeService — retrieves relevant knowledge base entries
 * (elevator codes, maintenance standards, regulatory references)
 * to inject into Claude's analysis context.
 */

async function getKnowledgeContext(state, equipment_type, review_type) {
  try {
    // Query knowledge entries relevant to this analysis
    // Match on: state (or global), equipment_type (or all), active only
    const result = await db.query(`
      SELECT title, category, content, source_url
      FROM knowledge
      WHERE active = TRUE
        AND (states IS NULL OR $1 = ANY(states) OR array_length(states, 1) IS NULL)
        AND (equipment_types IS NULL OR $2 = ANY(equipment_types) OR array_length(equipment_types, 1) IS NULL)
      ORDER BY category, created_at DESC
      LIMIT 20
    `, [state || '', equipment_type || '']);

    if (!result.rows.length) return '';

    let ctx = '[KNOWLEDGE BASE — Reference Standards & Codes]\n';
    const byCategory = {};
    result.rows.forEach(r => {
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    });

    Object.entries(byCategory).forEach(([category, entries]) => {
      const label = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      ctx += `\n## ${label}\n`;
      entries.forEach(e => {
        ctx += `### ${e.title}\n`;
        ctx += `${e.content}\n`;
        if (e.source_url) ctx += `Source: ${e.source_url}\n`;
      });
    });

    return ctx;
  } catch (err) {
    console.warn('[Knowledge] Context query failed:', err.message);
    return '';
  }
}

/**
 * addKnowledgeEntry — add a new knowledge base entry
 * Used by admin routes to populate elevator codes, maintenance standards, etc.
 */
async function addKnowledgeEntry({ title, category, content, source_url, equipment_types, states, tags }) {
  const result = await db.query(`
    INSERT INTO knowledge (title, category, content, source_url, equipment_types, states, tags)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [
    title,
    category,
    content,
    source_url || null,
    equipment_types || null,
    states || null,
    tags || null,
  ]);
  return result.rows[0].id;
}

module.exports = { getKnowledgeContext, addKnowledgeEntry };
