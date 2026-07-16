/* ============================================================
 * Shefory — Admin web (données réelles Supabase)
 * Requiert vendor/supabase.js, supabase.js, realtime.js chargés avant.
 * ============================================================ */

/* ---------------- helpers ---------------- */
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function initials(n){ return (n||'?').trim().split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase(); }
function fmtInt(n){ return Number(n||0).toLocaleString('fr-FR'); }
function fmtMoney(x){ x=Number(x||0); if(x>=1e6) return (x/1e6).toLocaleString('fr-FR',{maximumFractionDigits:2})+' M'; if(x>=1e4) return Math.round(x/1e3)+' K'; return fmtInt(x); }
function setTxt(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function emptyRow(cols,msg){ return `<tr><td colspan="${cols}" class="sub" style="text-align:center;padding:26px">${msg}</td></tr>`; }
function atoast(m){ const t=document.getElementById('atoast'); if(!t) return; t.textContent=m; t.classList.add('on'); clearTimeout(atoast._t); atoast._t=setTimeout(()=>t.classList.remove('on'),1900); }
function isThisMonth(iso){ const d=new Date(iso), n=new Date(); return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth(); }
function relDate(iso){ const d=new Date(iso), n=new Date(); const days=Math.floor((n-d)/864e5); if(days<=0) return "Aujourd'hui"; if(days===1) return 'Hier'; if(days<7) return days+' j'; return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}); }

const ST_PAY   = {succeeded:['st-ok','Réussi'],pending:['st-pend','En attente'],failed:['st-open','Échec'],refunded:['st-res','Remboursé']};
const ST_DISP  = {open:['st-open','Ouvert'],in_review:['st-pend','En cours'],resolved:['st-ok','Résolu'],rejected:['st-res','Rejeté']};
const PRIO     = {high:['st-open','Haute'],medium:['st-pend','Moyenne'],low:['st-res','Basse']};
const MM_EMOJI = {wave:'🌊 Wave',orange_money:'🟠 Orange Money',mtn_momo:'🟡 MTN MoMo',moov_money:'🔵 Moov Money',card:'💳 Carte',manual:'✍️ Manuel'};
const TIER_LBL = {gold:'Or',silver:'Argent',bronze:'Bronze'};
function driverName(dmap,id){ return (dmap[id] && dmap[id].display_name) || '—'; }

/* ---------------- portail ---------------- */
function gate(show){ const g=document.getElementById('adminGate'); if(g) g.classList.toggle('hide',!show); }
function agErr(m){ setTxt('agErr', m||''); }

async function bootAdmin(){
  if(SB.isLoggedIn() && SB.role()==='admin'){
    gate(false);
    if(window.initRealtimeSession) await initRealtimeSession();
    try{ await loadLiveAdmin(); }catch(e){ console.warn(e); atoast('Chargement des données impossible'); }
  } else {
    gate(true);
  }
}
window.bootAdmin = bootAdmin;

async function adminLogin(){
  const email=(document.getElementById('agEmail').value||'').trim();
  const pass=document.getElementById('agPass').value||'';
  if(!email||!pass){ agErr('Email et mot de passe requis.'); return; }
  const btn=document.getElementById('agBtn'); const lbl=btn.textContent; btn.disabled=true; btn.textContent='…';
  try{
    await SB.signIn(email,pass);
    if(SB.role()!=='admin'){ await SB.signOut(); agErr("Ce compte n'est pas administrateur."); return; }
    agErr(''); gate(false);
    if(window.initRealtimeSession) await initRealtimeSession();
    await loadLiveAdmin();
  }catch(e){
    agErr(/Invalid login/i.test(e.message)?'Identifiants incorrects.':(/Failed to fetch|NetworkError/i.test(e.message)?'Serveur injoignable.':e.message));
  }finally{ btn.disabled=false; btn.textContent=lbl; }
}
window.adminLogin = adminLogin;
window.adminDemo = function(){ gate(false); loadDemoAdmin(); };

/* ---------------- chargement live ---------------- */
async function loadLiveAdmin(){
  const [drvR, subR, payR, dispR] = await Promise.all([
    sbClient.from('drivers').select('id,display_name,city,pack_tier,verification_status,is_active,created_at').order('rank_score',{ascending:false}),
    sbClient.from('subscriptions').select('id,driver_id,tier,status').eq('status','active'),
    sbClient.from('payments').select('id,driver_id,amount_xof,method,status,created_at').order('created_at',{ascending:false}),
    sbClient.from('disputes').select('*').order('created_at',{ascending:false}),
  ]);
  for(const r of [drvR,subR,payR,dispR]){ if(r.error) throw r.error; }
  const drivers=drvR.data||[], subs=subR.data||[], pays=payR.data||[], disputes=dispR.data||[];
  const dmap={}; drivers.forEach(d=>dmap[d.id]=d);
  renderKPIs(drivers,subs,pays,disputes);
  renderChart(pays);
  renderDonut(drivers);
  renderRecent(pays,dmap);
  renderPayments(pays,dmap);
  renderDisputes(disputes,dmap);
  renderVerify(drivers);
}

function renderKPIs(drivers,subs,pays,disputes){
  const succ=pays.filter(p=>p.status==='succeeded');
  setTxt('kpiDrivers', fmtInt(drivers.filter(d=>d.is_active).length));
  setTxt('kpiSubs',    fmtInt(subs.length));
  const mrr=succ.filter(p=>isThisMonth(p.created_at)).reduce((s,p)=>s+(p.amount_xof||0),0);
  setTxt('kpiMRR', fmtMoney(mrr));
  const openDisp=disputes.filter(d=>d.status==='open').length;
  setTxt('kpiDisp', fmtInt(openDisp));
  const oc=document.getElementById('dispTabOpen'); if(oc) oc.textContent='Ouverts ('+openDisp+')';

  setTxt('kpiCash', fmtMoney(mrr));
  const pending=pays.filter(p=>p.status==='pending');
  setTxt('kpiPending', fmtMoney(pending.reduce((s,p)=>s+(p.amount_xof||0),0)));
  setTxt('kpiPendingSub', pending.length+' transaction'+(pending.length>1?'s':''));
  const failRate = pays.length ? (100*pays.filter(p=>p.status==='failed').length/pays.length) : 0;
  setTxt('kpiFail', failRate.toFixed(1).replace('.',',')+'%');

  setTxt('kpiToVerify', fmtInt(drivers.filter(d=>d.verification_status==='pending'||d.verification_status==='unverified').length));
  setTxt('kpiVerified', fmtInt(drivers.filter(d=>d.verification_status==='verified').length));
  setTxt('kpiSuspended', fmtInt(drivers.filter(d=>!d.is_active).length));
}

function renderChart(pays){
  const succ=pays.filter(p=>p.status==='succeeded');
  const now=new Date(); const buckets=[];
  for(let i=7;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); buckets.push({y:d.getFullYear(),m:d.getMonth(),label:d.toLocaleDateString('fr-FR',{month:'short'}),sum:0}); }
  succ.forEach(p=>{ const d=new Date(p.created_at); const b=buckets.find(x=>x.y===d.getFullYear()&&x.m===d.getMonth()); if(b) b.sum+=p.amount_xof||0; });
  const max=Math.max(1,...buckets.map(b=>b.sum));
  const unit = max>=1e6?'M':max>=1e3?'K':'';
  const val=v=> unit==='M'?(v/1e6).toFixed(1): unit==='K'?Math.round(v/1e3): v;
  setTxt('chartSub','Recettes mensuelles, 8 derniers mois'+(unit?(' ('+(unit==='M'?'millions':'milliers')+' FCFA)'):' (FCFA)'));
  document.getElementById('chart').innerHTML=buckets.map((b,i)=>`
    <div class="bar-wrap"><div class="bar" style="height:${Math.max(2,b.sum/max*100)}%;${i===buckets.length-1?'background:linear-gradient(180deg,#F2A03D,#e0891f)':''}"><span>${b.sum?val(b.sum)+unit:''}</span></div><small>${b.label}</small></div>`).join('');
}

function renderDonut(drivers){
  const c={gold:0,silver:0,bronze:0,none:0};
  drivers.forEach(d=>{ c[d.pack_tier||'none']++; });
  const paid=c.gold+c.silver+c.bronze;
  const seg=[['#D9A32B',c.gold],['#8C97A2',c.silver],['#B87A4B',c.bronze]];
  let acc=0; const stops=[]; const base=paid||1;
  seg.forEach(([col,n])=>{ const start=acc/base*100; acc+=n; const end=acc/base*100; if(n>0) stops.push(`${col} ${start}% ${end}%`); });
  if(!stops.length) stops.push('#E7EAE7 0% 100%');
  const pct=n=> paid? Math.round(100*n/paid)+'%':'0%';
  setTxt('donutSub', paid+' abonnement'+(paid>1?'s':'')+' actif'+(paid>1?'s':''));
  document.getElementById('donutWrap').innerHTML=`
    <div class="donut" style="background:conic-gradient(${stops.join(',')})"><b>${paid}</b></div>
    <div class="legend">
      <div><span class="dotc" style="background:#D9A32B"></span> Or — ${c.gold} <span class="sub">(${pct(c.gold)})</span></div>
      <div><span class="dotc" style="background:#8C97A2"></span> Argent — ${c.silver} <span class="sub">(${pct(c.silver)})</span></div>
      <div><span class="dotc" style="background:#B87A4B"></span> Bronze — ${c.bronze} <span class="sub">(${pct(c.bronze)})</span></div>
      <div><span class="dotc" style="background:#E7EAE7"></span> Gratuit — ${c.none}</div>
    </div>`;
}

function renderRecent(pays,dmap){
  const rows=pays.slice(0,6);
  const body=document.getElementById('recent');
  if(!rows.length){ body.innerHTML=emptyRow(6,'Aucun paiement pour l\'instant.'); return; }
  body.innerHTML=rows.map(p=>{
    const nm=driverName(dmap,p.driver_id); const st=ST_PAY[p.status]||['st-res',p.status];
    const tier=dmap[p.driver_id]?dmap[p.driver_id].pack_tier:null;
    const ev=p.status==='succeeded'?'Abonnement':p.status==='pending'?'En attente':'Échec paiement';
    return `<tr><td><div class="tr-name"><div class="av c3" style="width:32px;height:32px;font-size:12px">${initials(nm)}</div>${esc(nm)}</div></td>
      <td>${ev}</td><td>${TIER_LBL[tier]||'—'}</td><td><b>${fmtInt(p.amount_xof)} FCFA</b></td>
      <td><span class="st ${st[0]}">${st[1]}</span></td><td class="sub">${relDate(p.created_at)}</td></tr>`;
  }).join('');
}

function renderPayments(pays,dmap){
  const body=document.getElementById('payTable');
  if(!pays.length){ body.innerHTML=emptyRow(7,'Aucune transaction.'); return; }
  body.innerHTML=pays.map(p=>{
    const nm=driverName(dmap,p.driver_id); const st=ST_PAY[p.status]||['st-res',p.status];
    const tier=dmap[p.driver_id]?dmap[p.driver_id].pack_tier:null;
    const id='PAY-'+String(p.id).replace(/-/g,'').slice(0,4).toUpperCase();
    return `<tr><td><b>#${id}</b></td><td>${esc(nm)}</td><td>${MM_EMOJI[p.method]||esc(p.method)}</td>
      <td>${TIER_LBL[tier]||'—'}</td><td><b>${fmtInt(p.amount_xof)} FCFA</b></td>
      <td><span class="st ${st[0]}">${st[1]}</span></td>
      <td>${p.status==='failed'?`<button class="mini-btn" onclick="atoast('Relance envoyée (simulée)')">Relancer</button>`:`<button class="mini-btn g" onclick="atoast('Reçu #${id}')">Reçu</button>`}</td></tr>`;
  }).join('');
}

function renderDisputes(disputes,dmap){
  const body=document.getElementById('dispTable');
  if(!disputes.length){ body.innerHTML=emptyRow(6,'Aucun litige 🎉'); return; }
  body.innerHTML=disputes.map(d=>{
    const pr=PRIO[d.priority]||['st-res',d.priority]; const stt=ST_DISP[d.status]||['st-res',d.status];
    return `<tr><td><b>#${esc(d.code)}</b></td><td>Client ↔ ${esc(driverName(dmap,d.driver_id))}</td><td>${esc(d.reason||'')}</td>
      <td><span class="st ${pr[0]}">${pr[1]}</span></td><td><span class="st ${stt[0]}">${stt[1]}</span></td>
      <td>${d.status==='open'?`<button class="mini-btn" onclick="resolveDispute('${d.id}')">Résoudre</button> <button class="mini-btn g" onclick="atoast('${esc(d.details||'Litige')}')">Détails</button>`:`<button class="mini-btn g" onclick="atoast('Litige clôturé')">Voir</button>`}</td></tr>`;
  }).join('');
}

function renderVerify(drivers){
  const list=drivers.filter(d=>d.verification_status!=='verified');
  const body=document.getElementById('drvTable');
  if(!list.length){ body.innerHTML=emptyRow(6,'Tous les chauffeurs sont vérifiés ✅'); return; }
  body.innerHTML=list.map(d=>{
    const stt = d.verification_status==='rejected'?['st-open','Refusé']:d.verification_status==='pending'?['st-pend','À vérifier']:['st-pend','Non vérifié'];
    return `<tr><td><div class="tr-name"><div class="av c2" style="width:32px;height:32px;font-size:12px">${initials(d.display_name)}</div>${esc(d.display_name)}</div></td>
      <td>${esc(d.city||'—')}</td><td>${TIER_LBL[d.pack_tier]||'Gratuit'}</td>
      <td class="sub">${d.verification_status==='pending'?'En attente de revue':'Documents à fournir'}</td>
      <td><span class="st ${stt[0]}">${stt[1]}</span></td>
      <td><button class="mini-btn" onclick="verifyDriver('${d.id}',true)">✅ Valider</button> <button class="mini-btn d" onclick="verifyDriver('${d.id}',false)">Refuser</button></td></tr>`;
  }).join('');
}

/* ---------------- actions ---------------- */
window.verifyDriver = async function(id,ok){
  try{
    const patch = ok ? {verification_status:'verified',verified_at:new Date().toISOString()} : {verification_status:'rejected'};
    const r=await sbClient.from('drivers').update(patch).eq('id',id); if(r.error) throw r.error;
    atoast(ok?'Chauffeur vérifié ✅':'Chauffeur refusé'); await loadLiveAdmin();
  }catch(e){ console.warn(e); atoast('Action impossible'); }
};
window.resolveDispute = async function(id){
  try{
    const r=await sbClient.from('disputes').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('id',id); if(r.error) throw r.error;
    atoast('Litige résolu'); await loadLiveAdmin();
  }catch(e){ console.warn(e); atoast('Action impossible'); }
};

/* ---------------- repli démo (données fictives) ---------------- */
function loadDemoAdmin(){
  setTxt('kpiDrivers','1 247'); setTxt('kpiSubs','834'); setTxt('kpiMRR','6,42 M'); setTxt('kpiDisp','7');
  setTxt('kpiCash','6,42 M'); setTxt('kpiPending','312 K'); setTxt('kpiPendingSub','4 transactions'); setTxt('kpiFail','2,1%');
  setTxt('kpiToVerify','23'); setTxt('kpiVerified','1 224'); setTxt('kpiSuspended','5');
  const data=[3.1,3.4,3.9,4.2,4.8,5.3,5.9,6.42], labels=['Déc','Jan','Fév','Mar','Avr','Mai','Jun','Jul'], max=Math.max(...data);
  document.getElementById('chart').innerHTML=data.map((v,i)=>`<div class="bar-wrap"><div class="bar" style="height:${v/max*100}%;${i===data.length-1?'background:linear-gradient(180deg,#F2A03D,#e0891f)':''}"><span>${v}M</span></div><small>${labels[i]}</small></div>`).join('');
  setTxt('chartSub','Recettes mensuelles, 8 derniers mois (millions FCFA) — démo');
  setTxt('donutSub','834 abonnements actifs');
  document.getElementById('donutWrap').innerHTML=`<div class="donut" style="background:conic-gradient(#D9A32B 0 46%,#8C97A2 46% 74%,#B87A4B 74% 92%,#E7EAE7 92% 100%)"><b>834</b></div>
    <div class="legend"><div><span class="dotc" style="background:#D9A32B"></span> Or — 384 <span class="sub">(46%)</span></div>
    <div><span class="dotc" style="background:#8C97A2"></span> Argent — 234 <span class="sub">(28%)</span></div>
    <div><span class="dotc" style="background:#B87A4B"></span> Bronze — 150 <span class="sub">(18%)</span></div>
    <div><span class="dotc" style="background:#E7EAE7"></span> Gratuit — 413</div></div>`;
  const dm={ok:['st-ok','Réussi'],pend:['st-pend','En attente'],fail:['st-open','Échec']};
  const recent=[['Ibrahima Ndiaye','Abonnement','Or','15 000','ok',"Aujourd'hui"],['Aïcha Traoré','Abonnement','Argent','7 000','ok',"Aujourd'hui"],['Kwame Mensah','Abonnement','Or','15 000','ok','Hier'],['Fatou Diallo','Abonnement','Bronze','3 000','pend','Hier'],['Moussa Koné','Échec paiement','Argent','7 000','fail','2 j']];
  document.getElementById('recent').innerHTML=recent.map(r=>`<tr><td><div class="tr-name"><div class="av c3" style="width:32px;height:32px;font-size:12px">${initials(r[0])}</div>${r[0]}</div></td><td>${r[1]}</td><td>${r[2]}</td><td><b>${r[3]} FCFA</b></td><td><span class="st ${dm[r[4]][0]}">${dm[r[4]][1]}</span></td><td class="sub">${r[5]}</td></tr>`).join('');
  const pays=[['8842','Ibrahima Ndiaye','🌊 Wave','Or','15 000','ok'],['8841','Aïcha Traoré','🟠 Orange Money','Argent','7 000','ok'],['8840','Kwame Mensah','🌊 Wave','Or','15 000','ok'],['8839','Fatou Diallo','🟡 MTN MoMo','Bronze','3 000','pend'],['8838','Moussa Koné','💳 Carte','Argent','7 000','fail']];
  document.getElementById('payTable').innerHTML=pays.map(p=>`<tr><td><b>#PAY-${p[0]}</b></td><td>${p[1]}</td><td>${p[2]}</td><td>${p[3]}</td><td><b>${p[4]} FCFA</b></td><td><span class="st ${dm[p[5]][0]}">${dm[p[5]][1]}</span></td><td>${p[5]==='fail'?'<button class="mini-btn">Relancer</button>':'<button class="mini-btn g">Reçu</button>'}</td></tr>`).join('');
  const disp=[['L-142','Client ↔ Moussa K.','Chauffeur non présenté','Haute'],['L-141','Client ↔ Fatou D.','Désaccord sur le tarif','Moyenne'],['L-140','Client ↔ Kwame M.','Comportement inapproprié','Haute']];
  const pr={Haute:'st-open',Moyenne:'st-pend',Basse:'st-res'};
  document.getElementById('dispTable').innerHTML=disp.map(d=>`<tr><td><b>#${d[0]}</b></td><td>${d[1]}</td><td>${d[2]}</td><td><span class="st ${pr[d[3]]}">${d[3]}</span></td><td><span class="st st-open">Ouvert</span></td><td><button class="mini-btn">Résoudre</button> <button class="mini-btn g">Détails</button></td></tr>`).join('');
  const drv=[['Aminata Ba','Dakar','Argent','pend'],['Seydou Diarra','Bamako','Bronze','miss'],['Nadia Gueye','Thiès','Or','pend']];
  document.getElementById('drvTable').innerHTML=drv.map(d=>`<tr><td><div class="tr-name"><div class="av c2" style="width:32px;height:32px;font-size:12px">${initials(d[0])}</div>${d[0]}</div></td><td>${d[1]}</td><td>${d[2]}</td><td class="sub">${d[3]==='miss'?'Documents à fournir':'En attente de revue'}</td><td><span class="st ${d[3]==='miss'?'st-open':'st-pend'}">${d[3]==='miss'?'Incomplet':'À vérifier'}</span></td><td><button class="mini-btn">✅ Valider</button> <button class="mini-btn d">Refuser</button></td></tr>`).join('');
}
