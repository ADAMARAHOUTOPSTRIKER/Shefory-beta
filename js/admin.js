/* ============================================================
 * Shefory — Admin web (données réelles Supabase + mode démo)
 * Requiert vendor/supabase.js, supabase.js, realtime.js chargés avant.
 * ============================================================ */

/* ---------------- helpers ---------------- */
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function initials(n){ return (n||'?').trim().split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase(); }
function fmtInt(n){ return Number(n||0).toLocaleString('fr-FR'); }
function fmtMoney(x){ x=Number(x||0); if(x>=1e6) return (x/1e6).toLocaleString('fr-FR',{maximumFractionDigits:2})+' M'; if(x>=1e4) return Math.round(x/1e3)+' K'; return fmtInt(x); }
function setTxt(id,v){ const e=document.getElementById(id); if(!e) return;
  const changed=e.textContent!==String(v); e.textContent=v;
  if(changed&&e.classList&&e.classList.contains('val')){ e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } }
function emptyRow(cols,msg){ return `<tr><td colspan="${cols}" class="sub" style="text-align:center;padding:26px">${msg}</td></tr>`; }
function atoast(m){ const t=document.getElementById('atoast'); if(!t) return; t.textContent=m; t.classList.add('on'); clearTimeout(atoast._t); atoast._t=setTimeout(()=>t.classList.remove('on'),1900); }
function relDate(iso){ const d=new Date(iso), n=new Date(); const days=Math.floor((n-d)/864e5); if(days<=0) return "Aujourd'hui"; if(days===1) return 'Hier'; if(days<7) return days+' j'; return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}); }
function actTab(el){ el.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on')); el.classList.add('on'); }

const ST_PAY   = {succeeded:['st-ok','Réussi'],pending:['st-pend','En attente'],failed:['st-open','Échec'],refunded:['st-res','Remboursé']};
const ST_DISP  = {open:['st-open','Ouvert'],in_review:['st-pend','En cours'],resolved:['st-ok','Résolu'],rejected:['st-res','Rejeté']};
const PRIO     = {high:['st-open','Haute'],medium:['st-pend','Moyenne'],low:['st-res','Basse']};
const MM_EMOJI = {card:'💳 Carte (CMI)',orange_money:'🟠 Orange Money',inwi_money:'🟣 inwi money',cash_plus:'🟡 Cash Plus',manual:'✍️ Manuel'};
const TIER_LBL = {gold:'Or',silver:'Argent',bronze:'Bronze'};

/* ---------------- état ---------------- */
const ADM = {
  mode:null, drivers:[], subs:[], pays:[], disputes:[], clients:[], dmap:{},
  days:30, months:8, payFilter:'all', dispFilter:'open', drvFilter:'verify',
};
function driverName(id){ const d=ADM.dmap[id]; return d?d.display_name:'—'; }
function indexDrivers(){ ADM.dmap={}; ADM.drivers.forEach(d=>ADM.dmap[d.id]=d); }
function inWindow(iso){ return new Date(iso).getTime() >= Date.now() - ADM.days*864e5; }

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
  const [drvR, subR, payR, dispR, cliR] = await Promise.all([
    sbClient.from('drivers').select('id,display_name,city,pack_tier,verification_status,is_active,created_at').order('rank_score',{ascending:false}),
    sbClient.from('subscriptions').select('id,driver_id,tier,status').eq('status','active'),
    sbClient.from('payments').select('id,driver_id,amount_mad,method,status,created_at').order('created_at',{ascending:false}),
    sbClient.from('disputes').select('*').order('created_at',{ascending:false}),
    sbClient.from('profiles').select('id,full_name,phone,city,created_at').eq('role','client').order('created_at',{ascending:false}),
  ]);
  for(const r of [drvR,subR,payR,dispR,cliR]){ if(r.error) throw r.error; }
  ADM.mode='live';
  ADM.drivers=drvR.data||[]; ADM.subs=subR.data||[]; ADM.pays=payR.data||[];
  ADM.disputes=dispR.data||[]; ADM.clients=cliR.data||[];
  indexDrivers(); renderAll();
}
function refresh(){
  if(ADM.mode==='live') loadLiveAdmin().catch(e=>{ console.warn(e); atoast('Rafraîchissement impossible'); });
  else { indexDrivers(); renderAll(); }
}
function renderAll(){
  renderKPIs(); renderChart(); renderDonut(); renderRecent();
  renderPayments(); renderDisputes(); renderVerify(); renderClients();
}

/* ---------------- période (30j / 90j / 12 mois) ---------------- */
window.setPeriod = function(el,days,months){
  ADM.days=days; ADM.months=months; actTab(el);
  renderKPIs(); renderChart();
  atoast(days===365?'Période : 12 mois':'Période : '+days+' jours');
};

/* ---------------- KPIs ---------------- */
function renderKPIs(){
  const succ=ADM.pays.filter(p=>p.status==='succeeded');
  setTxt('kpiDrivers', fmtInt(ADM.drivers.filter(d=>d.is_active).length));
  setTxt('kpiSubs',    fmtInt(ADM.subs.length));
  const rev=succ.filter(p=>inWindow(p.created_at)).reduce((s,p)=>s+(p.amount_mad||0),0);
  setTxt('kpiMRR', fmtMoney(rev));
  const openDisp=ADM.disputes.filter(d=>d.status==='open').length;
  setTxt('kpiDisp', fmtInt(openDisp));
  const oc=document.getElementById('dispTabOpen'); if(oc) oc.textContent='Ouverts ('+openDisp+')';

  setTxt('kpiCash', fmtMoney(rev));
  const pending=ADM.pays.filter(p=>p.status==='pending');
  setTxt('kpiPending', fmtMoney(pending.reduce((s,p)=>s+(p.amount_mad||0),0)));
  setTxt('kpiPendingSub', pending.length+' transaction'+(pending.length>1?'s':''));
  const failRate = ADM.pays.length ? (100*ADM.pays.filter(p=>p.status==='failed').length/ADM.pays.length) : 0;
  setTxt('kpiFail', failRate.toFixed(1).replace('.',',')+'%');

  setTxt('kpiToVerify', fmtInt(ADM.drivers.filter(d=>d.is_active&&d.verification_status!=='verified').length));
  setTxt('kpiVerified', fmtInt(ADM.drivers.filter(d=>d.verification_status==='verified').length));
  setTxt('kpiSuspended', fmtInt(ADM.drivers.filter(d=>!d.is_active).length));
}

/* ---------------- graphe revenus ---------------- */
function renderChart(){
  const succ=ADM.pays.filter(p=>p.status==='succeeded');
  const now=new Date(); const buckets=[];
  for(let i=ADM.months-1;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    buckets.push({y:d.getFullYear(),m:d.getMonth(),label:d.toLocaleDateString('fr-FR',{month:'short'}),sum:0});
  }
  succ.forEach(p=>{ const d=new Date(p.created_at); const b=buckets.find(x=>x.y===d.getFullYear()&&x.m===d.getMonth()); if(b) b.sum+=p.amount_mad||0; });
  const max=Math.max(1,...buckets.map(b=>b.sum));
  const unit = max>=1e6?'M':max>=1e3?'K':'';
  const val=v=> unit==='M'?(v/1e6).toFixed(1): unit==='K'?Math.round(v/1e3): v;
  setTxt('chartSub','Recettes mensuelles, '+ADM.months+' derniers mois'+(unit?(' ('+(unit==='M'?'millions':'milliers')+' DH)'):' (DH)'));
  document.getElementById('chart').innerHTML=buckets.map((b,i)=>`
    <div class="bar-wrap"><div class="bar" style="height:${Math.max(2,b.sum/max*100)}%;animation-delay:${i*45}ms;${i===buckets.length-1?'background:linear-gradient(180deg,#F2A03D,#e0891f)':''}"><span>${b.sum?val(b.sum)+unit:''}</span></div><small>${b.label}</small></div>`).join('');
}

/* ---------------- donut packs ---------------- */
function renderDonut(){
  const c={gold:0,silver:0,bronze:0,none:0};
  ADM.drivers.forEach(d=>{ c[d.pack_tier||'none']++; });
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

/* ---------------- activité récente ---------------- */
function renderRecent(){
  const rows=ADM.pays.slice(0,6);
  const body=document.getElementById('recent');
  if(!rows.length){ body.innerHTML=emptyRow(6,'Aucun paiement pour l\'instant.'); return; }
  body.innerHTML=rows.map(p=>{
    const nm=driverName(p.driver_id); const st=ST_PAY[p.status]||['st-res',p.status];
    const tier=ADM.dmap[p.driver_id]?ADM.dmap[p.driver_id].pack_tier:null;
    const ev=p.status==='succeeded'?'Abonnement':p.status==='pending'?'En attente':'Échec paiement';
    return `<tr><td><div class="tr-name"><div class="av c3" style="width:32px;height:32px;font-size:12px">${initials(nm)}</div>${esc(nm)}</div></td>
      <td>${ev}</td><td>${TIER_LBL[tier]||'—'}</td><td><b>${fmtInt(p.amount_mad)} DH</b></td>
      <td><span class="st ${st[0]}">${st[1]}</span></td><td class="sub">${relDate(p.created_at)}</td></tr>`;
  }).join('');
}

/* ---------------- paiements (filtres + CSV) ---------------- */
window.payTab = function(el,f){ ADM.payFilter=f; actTab(el); renderPayments(); };
function renderPayments(){
  const body=document.getElementById('payTable'); const f=ADM.payFilter;
  const rows=ADM.pays.filter(p=>f==='all'||p.status===f);
  if(!rows.length){ body.innerHTML=emptyRow(7,'Aucune transaction dans ce filtre.'); return; }
  body.innerHTML=rows.map(p=>{
    const nm=driverName(p.driver_id); const st=ST_PAY[p.status]||['st-res',p.status];
    const tier=ADM.dmap[p.driver_id]?ADM.dmap[p.driver_id].pack_tier:null;
    const id='PAY-'+String(p.id).replace(/-/g,'').slice(0,4).toUpperCase();
    return `<tr><td><b>#${id}</b></td><td>${esc(nm)}</td><td>${MM_EMOJI[p.method]||esc(p.method)}</td>
      <td>${TIER_LBL[tier]||'—'}</td><td><b>${fmtInt(p.amount_mad)} DH</b></td>
      <td><span class="st ${st[0]}">${st[1]}</span></td>
      <td>${p.status==='failed'?`<button class="mini-btn" onclick="atoast('Relance envoyée (simulée)')">Relancer</button>`:`<button class="mini-btn g" onclick="atoast('Reçu #${id}')">Reçu</button>`}</td></tr>`;
  }).join('');
}
window.exportCSV = function(){
  const rows=[['id','chauffeur','moyen','montant_dh','statut','date']];
  ADM.pays.forEach(p=>rows.push([p.id,driverName(p.driver_id),p.method,p.amount_mad,p.status,p.created_at]));
  const csv=rows.map(r=>r.map(x=>'"'+String(x==null?'':x).replace(/"/g,'""')+'"').join(';')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='shefory-paiements.csv'; a.click();
  atoast('Export CSV téléchargé ('+(rows.length-1)+' lignes)');
};

/* ---------------- litiges (filtres) ---------------- */
window.dispTab = function(el,f){ ADM.dispFilter=f; actTab(el); renderDisputes(); };
function renderDisputes(){
  const body=document.getElementById('dispTable'); const f=ADM.dispFilter;
  const rows=ADM.disputes.filter(d=> f==='open'?d.status==='open' : f==='in_review'?d.status==='in_review' : (d.status==='resolved'||d.status==='rejected'));
  if(!rows.length){ body.innerHTML=emptyRow(6, f==='open'?'Aucun litige ouvert 🎉':'Rien dans ce filtre.'); return; }
  body.innerHTML=rows.map(d=>{
    const pr=PRIO[d.priority]||['st-res',d.priority]; const stt=ST_DISP[d.status]||['st-res',d.status];
    return `<tr><td><b>#${esc(d.code)}</b></td><td>Client ↔ ${esc(driverName(d.driver_id))}</td><td>${esc(d.reason||'')}</td>
      <td><span class="st ${pr[0]}">${pr[1]}</span></td><td><span class="st ${stt[0]}">${stt[1]}</span></td>
      <td>${d.status==='open'||d.status==='in_review'
        ?`<button class="mini-btn" onclick="resolveDispute('${d.id}')">Résoudre</button> <button class="mini-btn g" onclick="atoast('${esc(String(d.details||'Litige').replace(/'/g,' '))}')">Détails</button>`
        :`<button class="mini-btn g" onclick="atoast('Litige clôturé')">Voir</button>`}</td></tr>`;
  }).join('');
}
window.resolveDispute = async function(id){
  if(ADM.mode==='demo'){
    const d=ADM.disputes.find(x=>String(x.id)===String(id));
    if(d) d.status='resolved';
    atoast('Litige résolu (démo)'); renderAll(); return;
  }
  try{
    const r=await sbClient.from('disputes').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('id',id);
    if(r.error) throw r.error;
    atoast('Litige résolu'); refresh();
  }catch(e){ console.warn(e); atoast('Action impossible'); }
};

/* ---------------- chauffeurs (vérif / actifs / suspendus) ---------------- */
window.drvTab = function(el,f){ ADM.drvFilter=f; actTab(el); renderVerify(); };
function renderVerify(){
  const body=document.getElementById('drvTable'); const f=ADM.drvFilter;
  let rows;
  if(f==='active')         rows=ADM.drivers.filter(d=>d.is_active&&d.verification_status==='verified');
  else if(f==='suspended') rows=ADM.drivers.filter(d=>!d.is_active);
  else                     rows=ADM.drivers.filter(d=>d.is_active&&d.verification_status!=='verified');
  if(!rows.length){
    body.innerHTML=emptyRow(6, f==='verify'?'Tous les chauffeurs sont vérifiés ✅': f==='active'?'Aucun chauffeur actif vérifié.':'Aucun chauffeur suspendu.');
    return;
  }
  body.innerHTML=rows.map(d=>{
    let stt,act;
    if(f==='active'){ stt=['st-ok','Actif']; act=`<button class="mini-btn d" onclick="suspendDriver('${d.id}',false)">Suspendre</button>`; }
    else if(f==='suspended'){ stt=['st-res','Suspendu']; act=`<button class="mini-btn" onclick="suspendDriver('${d.id}',true)">Réactiver</button>`; }
    else{
      stt = d.verification_status==='rejected'?['st-open','Refusé']:d.verification_status==='pending'?['st-pend','À vérifier']:['st-pend','Non vérifié'];
      act = `<button class="mini-btn" onclick="verifyDriver('${d.id}',true)">✅ Valider</button> <button class="mini-btn d" onclick="verifyDriver('${d.id}',false)">Refuser</button>`;
    }
    return `<tr><td><div class="tr-name"><div class="av c2" style="width:32px;height:32px;font-size:12px">${initials(d.display_name)}</div>${esc(d.display_name)}</div></td>
      <td>${esc(d.city||'—')}</td><td>${TIER_LBL[d.pack_tier]||'Gratuit'}</td>
      <td class="sub">${f==='verify'?(d.verification_status==='pending'?'En attente de revue':'Documents à fournir'):(d.verification_status==='verified'?'Documents validés':'—')}</td>
      <td><span class="st ${stt[0]}">${stt[1]}</span></td><td>${act}</td></tr>`;
  }).join('');
}
window.verifyDriver = async function(id,ok){
  if(ADM.mode==='demo'){
    const d=ADM.dmap[id]; if(d) d.verification_status=ok?'verified':'rejected';
    atoast(ok?'Chauffeur vérifié ✅ (démo)':'Chauffeur refusé (démo)'); renderAll(); return;
  }
  try{
    const patch = ok ? {verification_status:'verified',verified_at:new Date().toISOString()} : {verification_status:'rejected'};
    const r=await sbClient.from('drivers').update(patch).eq('id',id); if(r.error) throw r.error;
    atoast(ok?'Chauffeur vérifié ✅':'Chauffeur refusé'); refresh();
  }catch(e){ console.warn(e); atoast('Action impossible'); }
};
window.suspendDriver = async function(id,active){
  if(ADM.mode==='demo'){
    const d=ADM.dmap[id]; if(d) d.is_active=active;
    atoast(active?'Chauffeur réactivé (démo)':'Chauffeur suspendu (démo)'); renderAll(); return;
  }
  try{
    const r=await sbClient.from('drivers').update({is_active:active}).eq('id',id); if(r.error) throw r.error;
    atoast(active?'Chauffeur réactivé':'Chauffeur suspendu'); refresh();
  }catch(e){ console.warn(e); atoast('Action impossible'); }
};

/* ---------------- clients ---------------- */
function renderClients(){
  const body=document.getElementById('clientTable'); if(!body) return;
  if(!ADM.clients.length){ body.innerHTML=emptyRow(4,'Aucun client inscrit pour l\'instant.'); return; }
  body.innerHTML=ADM.clients.map(c=>`
    <tr><td><div class="tr-name"><div class="av c4" style="width:32px;height:32px;font-size:12px">${initials(c.full_name)}</div>${esc(c.full_name||'—')}</div></td>
    <td>${esc(c.phone||'—')}</td><td>${esc(c.city||'—')}</td>
    <td class="sub">${c.created_at?relDate(c.created_at):'—'}</td></tr>`).join('');
}

/* ---------------- mode démo (mêmes structures que le live) ---------------- */
function loadDemoAdmin(){
  const M=k=>{ const d=new Date(); d.setMonth(d.getMonth()-k,15); return d.toISOString(); };
  const drivers=[
    {id:'d1',display_name:'Youssef El Amrani',city:'Casablanca',pack_tier:'gold',verification_status:'verified',is_active:true},
    {id:'d2',display_name:'Salma Benkirane',city:'Rabat',pack_tier:'silver',verification_status:'verified',is_active:true},
    {id:'d3',display_name:'Karim Tazi',city:'Marrakech',pack_tier:'gold',verification_status:'verified',is_active:true},
    {id:'d4',display_name:'Fatima Ezzahra Idrissi',city:'Casablanca',pack_tier:'bronze',verification_status:'verified',is_active:true},
    {id:'d5',display_name:'Mehdi Alaoui',city:'Tanger',pack_tier:null,verification_status:'pending',is_active:true},
    {id:'d6',display_name:'Amina Berrada',city:'Casablanca',pack_tier:'silver',verification_status:'pending',is_active:true},
    {id:'d7',display_name:'Omar Chraibi',city:'Fès',pack_tier:null,verification_status:'unverified',is_active:true},
    {id:'d8',display_name:'Nabil Sekkat',city:'Agadir',pack_tier:null,verification_status:'verified',is_active:false},
  ];
  const subs=[
    {id:'s1',driver_id:'d1',tier:'gold',status:'active'},
    {id:'s2',driver_id:'d2',tier:'silver',status:'active'},
    {id:'s3',driver_id:'d3',tier:'gold',status:'active'},
    {id:'s4',driver_id:'d4',tier:'bronze',status:'active'},
    {id:'s5',driver_id:'d6',tier:'silver',status:'active'},
  ];
  const pays=[]; let pid=1;
  for(let k=7;k>=0;k--){
    const n=8-k;
    for(let i=0;i<n;i++){
      pays.push({id:'p'+(pid++),driver_id:'d'+((i%4)+1),amount_mad:i%3===0?199:99,
        method:['card','orange_money','inwi_money','cash_plus'][i%4],status:'succeeded',created_at:M(k)});
    }
  }
  pays.reverse();
  pays.unshift({id:'p'+(pid++),driver_id:'d6',amount_mad:49,method:'inwi_money',status:'pending',created_at:M(0)});
  pays.unshift({id:'p'+(pid++),driver_id:'d5',amount_mad:99,method:'card',status:'failed',created_at:M(0)});
  const disputes=[
    {id:'x1',code:'L-3',driver_id:'d5',reason:'Chauffeur non présenté',details:'Rendez-vous manqué le 12/07 à Casablanca.',priority:'high',status:'open'},
    {id:'x2',code:'L-2',driver_id:'d4',reason:'Désaccord sur le tarif',details:'Le tarif convenu ne correspond pas à la facture.',priority:'medium',status:'in_review'},
    {id:'x3',code:'L-1',driver_id:'d3',reason:'Retard répété',details:'Résolu après médiation.',priority:'low',status:'resolved'},
  ];
  const clients=[
    {id:'c1',full_name:'Meryem Saidi',phone:'+212 6 61 •• •• 12',city:'Casablanca',created_at:M(1)},
    {id:'c2',full_name:'Hicham Bounou',phone:'+212 6 65 •• •• 88',city:'Rabat',created_at:M(0)},
    {id:'c3',full_name:'Sara Lamrani',phone:'+212 6 70 •• •• 45',city:'Marrakech',created_at:M(0)},
  ];
  ADM.mode='demo';
  ADM.drivers=drivers; ADM.subs=subs; ADM.pays=pays; ADM.disputes=disputes; ADM.clients=clients;
  indexDrivers(); renderAll();
  atoast('Mode démo — données fictives');
}
