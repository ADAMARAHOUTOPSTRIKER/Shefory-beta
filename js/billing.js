/* ============================================================
 * Shefory — abonnements & paiements (écrit réellement en base)
 * Le paiement Mobile Money est simulé côté UI, mais chaque
 * souscription crée une ligne `subscriptions` + `payments`, ce qui
 * déclenche la synchro du pack et fait monter le classement.
 * ============================================================ */

window.loadPacks = async function () {
  const r = await sbClient
    .from("subscription_packs")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (r.error) throw r.error;
  return r.data || [];
};

window.getMyDriver = async function () {
  const me = SB.user();
  const r = await sbClient.from("drivers").select("*").eq("id", me.id).maybeSingle();
  if (r.error) throw r.error;
  return r.data;
};

window.getMySubscription = async function () {
  const me = SB.user();
  const r = await sbClient
    .from("subscriptions")
    .select("*")
    .eq("driver_id", me.id)
    .eq("status", "active")
    .maybeSingle();
  if (r.error) throw r.error;
  return r.data;
};

/* Crée la fiche chauffeur si elle n'existe pas encore. */
window.ensureDriverRow = async function () {
  const me = SB.user();
  const found = await sbClient.from("drivers").select("id").eq("id", me.id).maybeSingle();
  if (found.error) throw found.error;
  if (found.data) return found.data;
  const name = (me.user_metadata && me.user_metadata.full_name) || me.email;
  const ins = await sbClient
    .from("drivers")
    .insert({ id: me.id, display_name: name, is_active: true })
    .select()
    .single();
  if (ins.error) throw ins.error;
  return ins.data;
};

/* Souscrit / change de pack. `method` = wave|orange_money|mtn_momo|moov_money */
window.subscribeToPack = async function (tier, method) {
  const me = SB.user();
  await ensureDriverRow();

  const pk = await sbClient.from("subscription_packs").select("*").eq("tier", tier).single();
  if (pk.error) throw pk.error;
  const pack = pk.data;

  const now = new Date();
  const end = new Date(now.getTime() + 30 * 864e5);

  // abonnement actif existant ? -> on le met à jour, sinon on en crée un
  const cur = await sbClient
    .from("subscriptions")
    .select("*")
    .eq("driver_id", me.id)
    .eq("status", "active")
    .maybeSingle();
  if (cur.error) throw cur.error;

  let sub;
  const payload = {
    pack_id: pack.id,
    tier,
    provider: method,
    status: "active",
    current_period_start: now.toISOString(),
    current_period_end: end.toISOString(),
  };
  if (cur.data) {
    const up = await sbClient.from("subscriptions").update(payload).eq("id", cur.data.id).select().single();
    if (up.error) throw up.error;
    sub = up.data;
  } else {
    const ins = await sbClient
      .from("subscriptions")
      .insert({ driver_id: me.id, ...payload })
      .select()
      .single();
    if (ins.error) throw ins.error;
    sub = ins.data;
  }

  // paiement simulé (mais réellement enregistré pour l'admin / le MRR)
  const pay = await sbClient.from("payments").insert({
    subscription_id: sub.id,
    driver_id: me.id,
    amount_xof: pack.price_xof,
    method,
    status: "succeeded",
    paid_at: now.toISOString(),
  });
  if (pay.error) throw pay.error;

  return { sub, pack };
};
