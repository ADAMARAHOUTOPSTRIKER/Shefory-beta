/* ============================================================
 * Shefory — configuration & client Supabase (léger, sans dépendance)
 * ============================================================ */
window.SHEFORY = {
  url: "https://pmtqyiriapzlpqcxuleo.supabase.co",
  // Clé PUBLIQUE (publishable) — sûre à exposer côté navigateur, la RLS protège les données.
  key: "sb_publishable_MZmFVPmsSBpwcTZCmLXJug_zBf5yl7b",
};

/* Petit helper REST (PostgREST). Renvoie le JSON, lève une erreur sinon. */
window.sbRest = async function (path, opts = {}) {
  const { method = "GET", headers = {}, body, token } = opts;
  const res = await fetch(SHEFORY.url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: SHEFORY.key,
      Authorization: "Bearer " + (token || SHEFORY.key),
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("REST " + res.status + " — " + (await res.text()));
  return res.status === 204 ? null : res.json();
};
