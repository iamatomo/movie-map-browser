// Resolves a movie title to a TMDB match, then checks its current US
// streaming providers. TMDB's watch-providers data is supplied through
// an official partnership with JustWatch, this is the legitimate way to
// get that data (their own internal API is access-restricted to their
// own apps and isn't something to route around).
//
// Requires TMDB_READ_TOKEN in Vercel's environment variables: the "API
// Read Access Token (v4 auth)" from themoviedb.org/settings/api, not
// the older v3 "API Key".

module.exports = async function handler(req, res) {
  const token = process.env.TMDB_READ_TOKEN;
  const title = req.query.title;

  if (!token) {
    res.status(500).json({ error: "Missing TMDB_READ_TOKEN in Vercel's environment variables." });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "Missing title query parameter." });
    return;
  }

  const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };

  try {
    const searchUrl = new URL("https://api.themoviedb.org/3/search/movie");
    searchUrl.searchParams.set("query", title);
    searchUrl.searchParams.set("include_adult", "false");
    const searchResp = await fetch(searchUrl, { headers });
    if (!searchResp.ok) throw new Error(`TMDB search error ${searchResp.status}`);
    const searchData = await searchResp.json();
    const match = searchData.results && searchData.results[0];

    if (!match) {
      res.status(200).json({ providers: [], matched: false });
      return;
    }

    const provResp = await fetch(
      `https://api.themoviedb.org/3/movie/${match.id}/watch/providers`,
      { headers }
    );
    if (!provResp.ok) throw new Error(`TMDB providers error ${provResp.status}`);
    const provData = await provResp.json();
    const us = provData.results && provData.results.US;

    const names = [];
    if (us) {
      (us.flatrate || []).forEach((p) => names.push(p.provider_name));
      (us.ads || []).forEach((p) => names.push(p.provider_name));
    }

    // Cached for 6 hours: JustWatch's own feed to TMDB only updates
    // about once a day anyway, so there's no point checking more often.
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate");
    res.status(200).json({ providers: names, matched: true, tmdbId: match.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
