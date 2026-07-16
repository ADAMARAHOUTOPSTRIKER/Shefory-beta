/* ============================================================
 * Shefory — fiche chauffeur : édition + upload (Storage)
 * Requiert supabase.js, realtime.js (sbClient), billing.js
 * (ensureDriverRow/getMyDriver) chargés avant. isLive/toast/… viennent
 * du script principal (index.html).
 * ============================================================ */
let pfPhotos = [], pfDocs = [];

function pfGet(id){ const e = document.getElementById(id); return e ? String(e.value).trim() : ""; }
function pfSet(id, v){ const e = document.getElementById(id); if (e) e.value = (v == null ? "" : v); }
function pfMsg(m){ const e = document.getElementById("pfMsg"); if (e) e.textContent = m || ""; }
function pfSanitize(n){ return (n || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40); }

async function openProfileEditor(){
  go("v-signup");
  if (!isLive()) { pfMsg("Connecte-toi pour éditer ta fiche."); return; }
  await loadDriverForm();
}
window.openProfileEditor = openProfileEditor;

async function loadDriverForm(){
  try {
    await ensureDriverRow();
    const d = await getMyDriver();
    if (d) {
      pfSet("pfName", d.display_name); pfSet("pfCity", d.city);
      pfSet("pfModel", d.vehicle_model); pfSet("pfYear", d.vehicle_year);
      pfSet("pfZones", (d.zones || []).join(", ")); pfSet("pfBio", d.bio);
      pfSet("pfPrice", d.price_month_mad);
      document.querySelectorAll("#pfVehType .selopt").forEach(o =>
        o.classList.toggle("on", o.dataset.v === d.vehicle_type));
    }
    await refreshMedia();
  } catch (e) { console.warn(e); pfMsg("Chargement impossible."); }
}

async function refreshMedia(){
  const me = SB.user();
  try {
    const ph = await sbClient.from("driver_photos").select("*").eq("driver_id", me.id).order("position", { ascending: true });
    pfPhotos = ph.data || []; renderPfPhotos();
    const dc = await sbClient.from("driver_documents").select("*").eq("driver_id", me.id).order("created_at", { ascending: false });
    pfDocs = dc.data || []; renderPfDocs();
  } catch (e) { console.warn(e); }
}

function photoPublicUrl(path){ return sbClient.storage.from("driver-photos").getPublicUrl(path).data.publicUrl; }

function renderPfPhotos(){
  const el = document.getElementById("pfPhotos"); if (!el) return;
  if (!pfPhotos.length) { el.innerHTML = '<div class="gal">🚗</div>'; return; }
  el.innerHTML = pfPhotos.map(p =>
    `<div class="gal" style="background-image:url('${photoPublicUrl(p.storage_path)}');background-size:cover;background-position:center;position:relative">
       <button onclick="deletePhoto('${p.id}','${p.storage_path}')" title="Supprimer" style="position:absolute;top:5px;right:5px;background:#000a;color:#fff;border-radius:50%;width:24px;height:24px;font-size:12px">✕</button>
     </div>`).join("");
}

const PF_DOC_LABEL = { permis: "Permis", carte_grise: "Carte grise", assurance: "Assurance", identite: "Pièce d'identité" };
const PF_DOC_STATUS = { pending: ["En attente", "var(--accent)"], verified: ["Validé", "var(--primary)"], rejected: ["Refusé", "var(--danger)"], unverified: ["—", "var(--muted)"] };
function renderPfDocs(){
  const el = document.getElementById("pfDocs"); if (!el) return;
  if (!pfDocs.length) { el.innerHTML = '<p class="sub" style="font-size:13px;margin:0">Aucun document ajouté.</p>'; return; }
  el.innerHTML = pfDocs.map(d => {
    const st = PF_DOC_STATUS[d.status] || ["", "var(--muted)"];
    return `<div class="kv"><span>📄 ${PF_DOC_LABEL[d.doc_type] || d.doc_type}</span><b style="color:${st[1]}">${st[0]}</b></div>`;
  }).join("");
}

async function saveDriverForm(){
  if (!isLive()) { toast("Connecte-toi pour enregistrer"); return; }
  const me = SB.user();
  const sel = document.querySelector("#pfVehType .selopt.on");
  const zones = pfGet("pfZones").split(",").map(s => s.trim()).filter(Boolean);
  const payload = {
    display_name: pfGet("pfName") || me.email,
    city: pfGet("pfCity") || null,
    vehicle_type: sel ? sel.dataset.v : null,
    vehicle_model: pfGet("pfModel") || null,
    vehicle_year: parseInt(pfGet("pfYear"), 10) || null,
    zones,
    bio: pfGet("pfBio") || null,
    price_month_mad: parseInt(pfGet("pfPrice").replace(/\D/g, ""), 10) || null,
  };
  pfMsg("Enregistrement…");
  try {
    const r = await sbClient.from("drivers").update(payload).eq("id", me.id);
    if (r.error) throw r.error;
    pfMsg(""); toast("Fiche enregistrée ✅");
    if (typeof refreshDriverDash === "function") refreshDriverDash();
    if (typeof loadDrivers === "function") loadDrivers();
    go("v-ddash");
  } catch (e) { console.warn(e); pfMsg("Erreur : " + e.message); }
}
window.saveDriverForm = saveDriverForm;

async function onPickPhoto(input){
  const f = input.files && input.files[0]; if (!f) return; input.value = "";
  if (!isLive()) { toast("Connecte-toi"); return; }
  const me = SB.user(); pfMsg("Téléversement de la photo…");
  try {
    const path = `${me.id}/${Date.now()}-${pfSanitize(f.name)}`;
    const up = await sbClient.storage.from("driver-photos").upload(path, f, { upsert: false });
    if (up.error) throw up.error;
    const ins = await sbClient.from("driver_photos").insert({ driver_id: me.id, storage_path: path, position: pfPhotos.length });
    if (ins.error) throw ins.error;
    pfMsg(""); toast("Photo ajoutée 📷"); await refreshMedia();
  } catch (e) { console.warn(e); pfMsg("Échec de la photo : " + e.message); }
}
window.onPickPhoto = onPickPhoto;

async function deletePhoto(id, path){
  try {
    await sbClient.storage.from("driver-photos").remove([path]);
    await sbClient.from("driver_photos").delete().eq("id", id);
    await refreshMedia(); toast("Photo supprimée");
  } catch (e) { console.warn(e); toast("Suppression impossible"); }
}
window.deletePhoto = deletePhoto;

async function onPickDoc(input){
  const f = input.files && input.files[0]; if (!f) return; input.value = "";
  if (!isLive()) { toast("Connecte-toi"); return; }
  const me = SB.user(); const type = pfGet("pfDocType") || "permis"; pfMsg("Téléversement du document…");
  try {
    const path = `${me.id}/${type}-${Date.now()}-${pfSanitize(f.name)}`;
    const up = await sbClient.storage.from("driver-docs").upload(path, f, { upsert: false });
    if (up.error) throw up.error;
    const ins = await sbClient.from("driver_documents").insert({ driver_id: me.id, doc_type: type, storage_path: path, status: "pending" });
    if (ins.error) throw ins.error;
    // repasse la fiche en "à vérifier" pour l'admin
    await sbClient.from("drivers").update({ verification_status: "pending" }).eq("id", me.id);
    pfMsg(""); toast("Document envoyé 📎"); await refreshMedia();
  } catch (e) { console.warn(e); pfMsg("Échec du document : " + e.message); }
}
window.onPickDoc = onPickDoc;
