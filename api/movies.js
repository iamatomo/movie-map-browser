// This runs on Vercel's servers, never in the browser.
// The Airtable token is read from an environment variable set in the
// Vercel dashboard (Project Settings -> Environment Variables), so it
// never appears in this file or in GitHub.

module.exports = async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!token || !baseId || !tableName) {
    res.status(500).json({
      error: "Missing one of AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME in Vercel's environment variables.",
    });
    return;
  }

  try {
    let records = [];
    let offset;

    // Airtable paginates 100 records at a time, so loop until there's no
    // more offset returned.
    do {
      const url = new URL(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`
      );
      if (offset) url.searchParams.set("offset", offset);

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Airtable error ${resp.status}: ${text}`);
      }

      const data = await resp.json();
      records = records.concat(data.records);
      offset = data.offset;
    } while (offset);

    // Flatten Airtable's {id, fields: {...}} shape into {id, ...fields}
    // so the frontend can treat every column as a plain property.
    const movies = records.map((r) => ({ id: r.id, ...r.fields }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({ movies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
