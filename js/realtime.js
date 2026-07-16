/* ============================================================
 * Shefory — messagerie temps réel (Supabase Realtime via supabase-js)
 * Nécessite js/vendor/supabase.js (global `supabase`) chargé avant.
 * ============================================================ */
window.sbClient = null;
try {
  if (window.supabase && window.SHEFORY) {
    window.sbClient = window.supabase.createClient(SHEFORY.url, SHEFORY.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
} catch (e) {
  console.warn("supabase-js indisponible — messagerie temps réel désactivée.", e);
}

/* Applique la session de l'utilisateur connecté (pour la RLS + Realtime). */
window.initRealtimeSession = async function () {
  if (!window.sbClient) return;
  const s = SB.session();
  if (s && s.access_token) {
    try {
      await sbClient.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
    } catch (e) {
      console.warn("setSession Realtime:", e.message);
    }
  }
};
window.teardownRealtime = async function () {
  if (!window.sbClient) return;
  try { await sbClient.removeAllChannels(); } catch (_) {}
  try { await sbClient.auth.signOut({ scope: "local" }); } catch (_) {}
};

/* ---------------- conversations & messages ---------------- */
window.ensureConversation = async function (driver) {
  const me = SB.user();
  const found = await sbClient
    .from("conversations")
    .select("*")
    .eq("client_id", me.id)
    .eq("driver_id", driver.dbId)
    .maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data;
  const ins = await sbClient
    .from("conversations")
    .insert({
      client_id: me.id,
      driver_id: driver.dbId,
      client_name: (me.user_metadata && me.user_metadata.full_name) || me.email,
      driver_name: driver.name,
      driver_avatar: driver.avatar || null,
    })
    .select()
    .single();
  if (ins.error) throw ins.error;
  return ins.data;
};

window.loadMessages = async function (convId) {
  const { data, error } = await sbClient
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
};

window.sendMessageDB = async function (convId, { kind = "text", body = null, amount = null }) {
  const me = SB.user();
  const { data, error } = await sbClient
    .from("messages")
    .insert({ conversation_id: convId, sender_id: me.id, kind, body, amount_xof: amount })
    .select()
    .single();
  if (error) throw error;
  return data;
};

window.subscribeMessages = function (convId, onInsert) {
  return sbClient
    .channel("conv-" + convId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + convId },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
};

window.loadConversationsDB = async function () {
  const me = SB.user();
  const col = SB.role() === "driver" ? "driver_id" : "client_id";
  const { data, error } = await sbClient
    .from("conversations")
    .select("*")
    .eq(col, me.id)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
};

window.markConversationRead = async function (conv) {
  if (!window.sbClient) return;
  const patch = SB.role() === "driver" ? { driver_unread: 0 } : { client_unread: 0 };
  try { await sbClient.from("conversations").update(patch).eq("id", conv.id); } catch (_) {}
};
