/* ============================================================
 * Shefory — configuration, client REST & Auth Supabase (sans dépendance)
 * ============================================================ */
window.SHEFORY = {
  url: "https://pmtqyiriapzlpqcxuleo.supabase.co",
  // Clé PUBLIQUE (publishable) — sûre côté navigateur, la RLS protège les données.
  key: "sb_publishable_MZmFVPmsSBpwcTZCmLXJug_zBf5yl7b",
};

/* ---------------- session (localStorage) ---------------- */
const SESSION_KEY = "shefory_session";
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

/* ---------------- helper REST (PostgREST) ---------------- */
window.sbRest = async function (path, opts = {}) {
  const { method = "GET", headers = {}, body, auth = false } = opts;
  const sess = getSession();
  const token = auth && sess ? sess.access_token : SHEFORY.key;
  const res = await fetch(SHEFORY.url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: SHEFORY.key,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("REST " + res.status + " — " + (await res.text()));
  return res.status === 204 ? null : res.json();
};

/* ---------------- Auth (GoTrue) ---------------- */
async function authFetch(path, body, method = "POST") {
  const res = await fetch(SHEFORY.url + "/auth/v1/" + path, {
    method,
    headers: { apikey: SHEFORY.key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || ("Auth " + res.status));
  return data;
}

window.SB = {
  session: getSession,
  user: () => (getSession() || {}).user || null,
  role: () => {
    const u = (getSession() || {}).user;
    return u && u.user_metadata ? u.user_metadata.role || "client" : null;
  },
  isLoggedIn: () => !!getSession(),

  async signIn(email, password) {
    const d = await authFetch("token?grant_type=password", { email, password });
    saveSession(d);
    return d;
  },

  async signUp({ email, password, role, full_name, phone }) {
    // création du compte (métadonnées -> rôle/nom via trigger).
    // redirect_to : où renvoie le lien de confirmation reçu par e-mail.
    const redirect = encodeURIComponent(location.origin + location.pathname);
    const d = await authFetch("signup?redirect_to=" + redirect, { email, password, data: { role, full_name, phone } });
    if (d && d.access_token) { saveSession(d); return { session: true }; }
    // pas de session : l'e-mail doit être confirmé d'abord
    return { needsConfirmation: true };
  },

  /* envoie l'e-mail « mot de passe oublié » */
  async resetPassword(email) {
    const redirect = encodeURIComponent(location.origin + location.pathname);
    return authFetch("recover?redirect_to=" + redirect, { email });
  },

  /* définit le nouveau mot de passe avec le token du lien de récupération */
  async updatePasswordWithToken(token, password) {
    const res = await fetch(SHEFORY.url + "/auth/v1/user", {
      method: "PUT",
      headers: { apikey: SHEFORY.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || ("Auth " + res.status));
    return data;
  },

  async signOut() {
    const sess = getSession();
    if (sess) {
      try {
        await fetch(SHEFORY.url + "/auth/v1/logout", {
          method: "POST",
          headers: { apikey: SHEFORY.key, Authorization: "Bearer " + sess.access_token },
        });
      } catch (_) {}
    }
    clearSession();
  },
};
