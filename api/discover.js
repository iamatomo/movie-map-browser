// Unlike api/providers.js (which checks one specific movie's
// availability), this searches TMDB's entire catalog for movies
// currently available on the selected streaming service(s), regardless
// of whether the user owns them. Genre and runtime still narrow things
// down the same way they do for the local-collection draft.

const STREAM_ALIASES = {
  "Netflix": ["netflix"],
  "Hulu": ["hulu"],
  "Disney+": ["disney plus", "disney+"],
  "Max": ["max", "hbo max"],
  "Prime Video": ["prime video", "amazon prime video"],
  "Apple TV+": ["apple tv+", "apple tv plus"],
  "Paramount+": ["paramount+", "paramount plus"],
  "Peacock": ["peacock"],
};

// Your genre names don't always match TMDB's canonical genre names
// exactly, this covers the known mismatches. Anything not listed here
// is tried as-is first.
const GENRE_ALIASES = {
  "sci-fi": "science fiction",
  "scifi": "science fiction",
  "musical": "music",
  "noir": "crime", // TMDB has no film-noir genre; crime is the closest real category
  "rom-com": "romance",
};

const RUNTIME_RANGES = {
  short: [0, 100],
  medium: [101, 140],
  long: [141, 160],
  epic: [161, 400],
};

module.exports = async function handler(req, res) {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Missing TMDB_READ_TOKEN in Vercel's environment variables." });
    return;
  }

  const genreParam = (req.query.genre || "").split(",").map((s) => s.trim()).filter(Boolean);
  const runtimeBuckets = (req.query.runtime || "").split(",").map((s) => s.trim()).filter(Boolean);
  const streamParam = (req.query.stream || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (genreParam.length === 0 || streamParam.length === 0) {
    res.status(400).json({ error: "genre and stream are required." });
    return;
  }

  const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };

  try {
    // Resolve genre names -> TMDB genre ids. Genres that don't resolve
    // (even after the alias table) are just skipped rather than
    // failing the whole request, so an unusual custom genre degrades
    // gracefully into "no genre filter" instead of an error.
    const genreListResp = await fetch("https://api.themoviedb.org/3/genre/movie/list?language=en", { headers });
    const genreListData = await genreListResp.json();
    const allGenres = genreListData.genres || [];
    const genreIds = [];
    genreParam.forEach((g) => {
      const normalized = g.toLowerCase();
      const wanted = GENRE_ALIASES[normalized] || normalized;
      const match = allGenres.find((tg) => tg.name.toLowerCase() === wanted);
      if (match) genreIds.push(match.id);
    });

    // Resolve selected service names -> TMDB provider ids by matching
    // provider_name at request time, rather than hardcoding ID numbers
    // TMDB doesn't publish as a stable documented list.
    const providerListResp = await fetch(
      "https://api.themoviedb.org/3/watch/providers/movie?watch_region=US&language=en",
      { headers }
    );
    const providerListData = await providerListResp.json();
    const allProviders = providerListData.results || [];
    const providerIds = [];
    streamParam.forEach((s) => {
      const aliases = STREAM_ALIASES[s] || [s.toLowerCase()];
      const found = allProviders.find((p) =>
        aliases.some((a) => (p.provider_name || "").toLowerCase().includes(a))
      );
      if (found) providerIds.push(found.provider_id);
    });

    if (providerIds.length === 0) {
      res.status(200).json({ results: [], note: "Could not match the selected service(s) to a TMDB provider." });
      return;
    }

    // Combined span across selected runtime buckets. Exact for a single
    // bucket or contiguous buckets. For a non-contiguous multi-select
    // (e.g. Short + Epic, skipping Medium/Long) this is a known
    // simplification: TMDB's discover endpoint only supports one
    // continuous range per request, so results may include some
    // Medium/Long titles too in that specific case.
    let gte = null, lte = null;
    runtimeBuckets.forEach((b) => {
      const range = RUNTIME_RANGES[b];
      if (!range) return;
      gte = gte === null ? range[0] : Math.min(gte, range[0]);
      lte = lte === null ? range[1] : Math.max(lte, range[1]);
    });

    const discoverUrl = new URL("https://api.themoviedb.org/3/discover/movie");
    discoverUrl.searchParams.set("watch_region", "US");
    discoverUrl.searchParams.set("with_watch_providers", providerIds.join("|")); // | = OR
    discoverUrl.searchParams.set("with_watch_monetization_types", "flatrate");
    discoverUrl.searchParams.set("include_adult", "false");
    discoverUrl.searchParams.set("sort_by", "popularity.desc");
    if (genreIds.length) discoverUrl.searchParams.set("with_genres", genreIds.join("|"));
    if (gte !== null) discoverUrl.searchParams.set("with_runtime.gte", String(gte));
    if (lte !== null) discoverUrl.searchParams.set("with_runtime.lte", String(lte));
    // A random early page instead of always page 1, so results aren't
    // just the same handful of most-popular titles every time.
    discoverUrl.searchParams.set("page", String(1 + Math.floor(Math.random() * 5)));

    const discoverResp = await fetch(discoverUrl, { headers });
    if (!discoverResp.ok) throw new Error(`TMDB discover error ${discoverResp.status}`);
    const discoverData = await discoverResp.json();

    const genreNameById = {};
    allGenres.forEach((g) => { genreNameById[g.id] = g.name; });

    const results = (discoverData.results || []).map((m) => ({
      tmdbId: m.id,
      title: m.title,
      overview: m.overview,
      releaseYear: (m.release_date || "").slice(0, 4),
      posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : null,
      genres: (m.genre_ids || []).map((id) => genreNameById[id]).filter(Boolean),
    }));

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).json({ results, genreMatched: genreIds.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
