/**
 * STIKAR LOCAL GATEWAY — Halaman siaran standalone (PHASE 2 §8, §9, §26)
 * /display/:tid — Mode A utama untuk TV: gameplay besar kiri, leaderboard kanan,
 *                 header ronde/map, ticker bawah, animasi LIVE NOW, emergency screen.
 * /live/:tid    — Untuk HP penonton: video + info + leaderboard ringkas.
 * /             — Halaman info gateway (daftar link + status server).
 *
 * Semua halaman: WebSocket presence (hitungan viewer NYATA), leaderboard realtime
 * via Firestore REST (publik), video WebRTC WHE dengan fallback HLS (hls.js lokal
 * — tetap berjalan tanpa internet). Status koneksi ditampilkan JUJUR.
 */

const CSS = `
:root{
  --bg:#080B10;--panel:#18212C;--edge:#26303C;--text:#F7F9FC;--muted:#98A2B3;
  --fire:#FF5A1F;--flame:#FF8A00;--gold:#FFC247;--cyan:#35D6FF;--err:#EF4444;--ok:#22C55E;--ink:#0B0E14;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden}
.cond{font-family:'Barlow Condensed','Space Grotesk',system-ui,sans-serif;text-transform:uppercase}
.stat{font-family:Rajdhani,'Segoe UI',sans-serif;font-variant-numeric:tabular-nums}
#app{display:flex;flex-direction:column;height:100vh}
header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px;border-bottom:1px solid var(--edge);background:linear-gradient(180deg,#0C1117,#080B10)}
.brand{display:flex;align-items:center;gap:10px}
.logo{display:grid;place-items:center;width:40px;height:40px;background:linear-gradient(135deg,var(--fire),var(--flame));clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));font-weight:900;font-size:20px;color:#fff}
.brand h1{font-size:20px;letter-spacing:.14em}
.brand h1 b{color:var(--fire)}
.brand p{font-size:10px;letter-spacing:.3em;color:var(--muted);font-weight:700}
.matchinfo{text-align:center}
.matchinfo .t{font-size:11px;letter-spacing:.28em;color:var(--muted);font-weight:700}
.matchinfo .m{font-size:22px;font-weight:800;letter-spacing:.06em}
.matchinfo .m b{color:var(--gold)}
.rightinfo{display:flex;align-items:center;gap:12px}
.live{display:inline-flex;align-items:center;gap:8px;background:var(--err);color:#fff;padding:5px 12px;font-weight:900;font-size:12px;letter-spacing:.2em;clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px));animation:fs-live 1.5s infinite}
@keyframes fs-live{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}50%{box-shadow:0 0 0 9px rgba(239,68,68,0)}}
.off{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--edge);color:var(--muted);padding:5px 12px;font-weight:800;font-size:12px;letter-spacing:.2em}
.clock{font-size:14px;color:var(--muted);font-weight:700}
main{flex:1;display:flex;min-height:0;background:
 radial-gradient(900px 400px at 90% -20%,rgba(255,90,31,.10),transparent 55%),
 radial-gradient(700px 380px at -10% 120%,rgba(53,214,255,.06),transparent 55%)}
.stage{flex:72 1 0%;position:relative;background:#000;display:flex;align-items:center;justify-content:center}
.stage video{width:100%;height:100%;object-fit:contain;background:#000}
.side{flex:28 1 0%;min-width:300px;border-left:1px solid var(--edge);background:#0C1117;display:flex;flex-direction:column}
.lb-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,138,0,.4)}
.lb-head h2{font-size:13px;letter-spacing:.24em;color:var(--gold);font-weight:800}
.dot-ok{width:8px;height:8px;border-radius:50%;background:var(--ok);animation:pulse 1.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.lb-rows{flex:1;overflow-y:auto}
.lb-rows::-webkit-scrollbar{width:6px}.lb-rows::-webkit-scrollbar-thumb{background:#313E4D}
.row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(38,48,60,.6);background:#141B24}
.row.top1{background:linear-gradient(90deg,rgba(255,194,71,.16),transparent 55%);box-shadow:inset 3px 0 0 var(--gold)}
.row.top2{box-shadow:inset 3px 0 0 #C0C8D4}
.row.top3{box-shadow:inset 3px 0 0 #C98A4B}
.rk{width:30px;height:30px;display:grid;place-items:center;font-weight:800;font-size:14px;border:1px solid var(--edge);background:#0E131A}
.top1 .rk{background:var(--gold);color:var(--ink);border-color:transparent;box-shadow:0 0 12px rgba(255,194,71,.45)}
.top2 .rk{background:#C0C8D4;color:var(--ink);border-color:transparent}
.top3 .rk{background:#C98A4B;color:var(--ink);border-color:transparent}
.tm{flex:1;min-width:0}
.tm .n{font-size:14px;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm .tag{font-size:9px;letter-spacing:.18em;color:var(--muted);font-weight:700}
.kl{font-size:12px;color:var(--fire);font-weight:800;border:1px solid rgba(255,90,31,.4);background:rgba(255,90,31,.12);padding:2px 7px}
.pt{font-size:19px;font-weight:700;color:var(--gold);width:44px;text-align:right}
.row.top1 .pt{color:var(--gold)}
.lb-foot{padding:8px 14px;border-top:1px solid var(--edge);font-size:10px;letter-spacing:.16em;color:var(--muted);font-weight:700;display:flex;justify-content:space-between}
footer{border-top:1px solid var(--edge);background:#0C1117}
.ticker{overflow:hidden;padding:8px 0;white-space:nowrap}
.ticker .track{display:inline-block;animation:tk 30s linear infinite;font-size:13px;letter-spacing:.08em;color:var(--muted);font-weight:700}
.ticker .track b{color:var(--gold)}
@keyframes tk{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.conn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.78);text-align:center;padding:24px}
.conn .big{font-size:20px;letter-spacing:.22em;font-weight:800}
.conn .sm{font-size:12px;color:var(--muted);max-width:460px;line-height:1.6}
.spin{width:44px;height:44px;border:3px solid var(--cyan);border-top-color:transparent;border-radius:50%;animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.playbtn{width:74px;height:74px;border-radius:50%;border:2px solid var(--fire);background:rgba(255,90,31,.18);color:var(--fire);font-size:26px;cursor:pointer}
.playbtn:hover{background:rgba(255,90,31,.3)}
#livewrap{position:relative;animation:fin .6s ease both}
@keyframes fin{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}
.eventbanner{position:absolute;top:14%;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none}
.eventbanner .e1{font-size:46px;font-weight:900;letter-spacing:.14em;color:var(--fire);text-shadow:0 0 30px rgba(255,90,31,.55);animation:ev 0.7s cubic-bezier(.22,1,.36,1) both}
.eventbanner .e2{font-size:14px;letter-spacing:.34em;color:var(--gold);font-weight:800;margin-top:8px;animation:ev .9s .15s both}
@keyframes ev{from{opacity:0;transform:translateY(14px) scale(1.12)}to{opacity:1;transform:translateY(0) scale(1)}}
.emg{position:fixed;inset:0;background:#1a0000f2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:99;text-align:center;padding:30px}
.emg h1{font-size:52px;letter-spacing:.1em;color:#F87171}
.emg p{color:#fca5a5;max-width:640px;font-size:16px}
.badge{font-size:9px;letter-spacing:.2em;border:1px solid var(--edge);color:var(--muted);padding:2px 8px;font-weight:800}
.links a{color:var(--cyan);text-decoration:none}
.info{max-width:640px;margin:40px auto;padding:0 20px}
.info h1{font-size:34px;letter-spacing:.06em;margin-bottom:6px}
.card{background:var(--panel);border:1px solid var(--edge);padding:18px;margin-top:14px}
.card h2{font-size:13px;letter-spacing:.24em;color:var(--gold);margin-bottom:10px}
.rowl{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--edge);font-size:14px}
.ok{color:var(--ok)}.bad{color:var(--err)}
@media (max-width:860px){
  main{flex-direction:column;overflow-y:auto}
  .stage{min-height:56vh;flex:none}
  .side{border-left:0;border-top:1px solid var(--edge);min-width:0;flex:none}
  .matchinfo .m{font-size:16px}
  .brand h1{font-size:15px}
}
`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Parser nilai Firestore REST → JavaScript biasa. */
function parseFs(v) {
  if (v == null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const out = {};
    const f = v.mapValue.fields || {};
    for (const k of Object.keys(f)) out[k] = parseFs(f[k]);
    return out;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(parseFs);
  }
  return v;
}

function sharedScript({ tid, projectId, role }) {
  return `
const TID = ${JSON.stringify(tid)};
const PROJECT = ${JSON.stringify(projectId)};
const ROLE = ${JSON.stringify(role)};
const $ = (s) => document.querySelector(s);

// ---------- Presence viewer NYATA ----------
let ws;
function connectPresence(){
  try {
    ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws-viewer');
    ws.onopen = () => ws.send(JSON.stringify({type:'hello', role: ROLE, label: ROLE==='display' ? 'TV DISPLAY' : 'VIEWER '+Math.floor(Math.random()*900+100)}));
    ws.onclose = () => setTimeout(connectPresence, 4000);
  } catch(e) { setTimeout(connectPresence, 4000); }
}
connectPresence();

// ---------- Data Firestore REST (publik) ----------
function parseFs(v){
  if (v == null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o={}; const f=v.mapValue.fields||{}; for(const k of Object.keys(f)) o[k]=parseFs(f[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values||[]).map(parseFs);
  return v;
}
async function getDoc(path){
  const url = 'https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path;
  try {
    const r = await fetch(url, {signal: AbortSignal.timeout(7000)});
    if (!r.ok) return null;
    const j = await r.json();
    const out = {};
    const f = j.fields || {};
    for (const k of Object.keys(f)) out[k] = parseFs(f[k]);
    return out;
  } catch { return null; }
}
let lastEventId = null;
let eventShownUntil = 0;
let cacheLabel = '—';

async function pollData(){
  const [lb, bs, tour] = await Promise.all([
    getDoc('publicLeaderboards/'+TID),
    getDoc('broadcastSettings/'+TID),
    getDoc('tournaments/'+TID),
  ]);
  renderData(lb, bs, tour);
  setTimeout(pollData, 5000);
}

function renderData(lb, bs, tour){
  // --- header match info dari match current ---
  const t = $('#matchtitle');
  if (tour && tour.currentMatchId && tour.currentMatchId !== '') {
    // ambil doc match current untuk map/round
    getDoc('tournaments/'+TID+'/matches/'+tour.currentMatchId).then((m)=>{
      const round = m && m.matchNumber ? String(m.matchNumber).padStart(2,'0') : '—';
      const map = m && m.map ? m.map : 'UNKNOWN';
      const isLive = m && m.status === 'live';
      $('#matchround').textContent = 'ROUND '+round;
      $('#matchmap').textContent = map.toUpperCase();
      const liveEl = $('#livebadge');
      if (isLive){ liveEl.className='live'; liveEl.textContent='LIVE'; }
      else { liveEl.className='off'; liveEl.textContent='STANDBY'; }
    });
  } else {
    $('#matchround').textContent = 'ROUND —';
    $('#matchmap').textContent = 'NOT SET';
    $('#livebadge').className='off'; $('#livebadge').textContent='STANDBY';
  }

  // --- leaderboard ---
  if (lb && Array.isArray(lb.standings)) {
    cacheLabel = lb.updatedAt ? new Date(lb.updatedAt).toLocaleTimeString('id-ID') : '—';
    renderRows(lb.standings);
    $('#dbstatus').textContent = 'REALTIME DATA';
    $('#dbstatus').style.color = 'var(--ok)';
  } else {
    $('#dbstatus').textContent = 'DATA OFFLINE / CACHED';
    $('#dbstatus').style.color = 'var(--gold)';
  }

  // --- emergency menimpa segalanya ---
  const emg = bs && bs.emergency;
  const el = $('#emergency');
  if (emg && emg.active) {
    el.style.display='flex';
    $('#emg-title').textContent = emg.preset || 'TECHNICAL DIFFICULTIES';
    $('#emg-msg').textContent = emg.message || 'Siaran akan kembali sebentar lagi.';
  } else el.style.display='none';

  // --- event broadcast → animasi LIVE NOW / notice ---
  const ev = bs && bs.event;
  if (ev && ev.id && ev.id !== lastEventId) {
    lastEventId = ev.id;
    showEvent(ev);
  }

  // --- ticker ---
  const parts = [];
  if (bs && Array.isArray(bs.announcements) && bs.announcements.length) parts.push(bs.announcements[bs.announcements.length-1]);
  if (bs && bs.streamTitle) parts.push(bs.streamTitle);
  parts.push('BATTLE OFF FRIENDS · '+ (tour && tour.name ? tour.name : 'TURNAMEN') +' · SMK TI BALI GLOBAL KARANGASEM');
  parts.push('POWERED BY STIKAR ESPORTS — SAPUTRA DEVELOPER');
  const track = $('#tickertrack');
  const content = parts.map(x=>'<b>▸</b> '+esc(x)).join(' &nbsp;&nbsp; ');
  track.innerHTML = content + ' &nbsp;&nbsp; ' + content;
}

function showEvent(ev){
  const wrap = $('#eventbanner');
  const label = {
    LIVE_NOW: 'LIVE NOW', LIVE_STARTING: 'LIVE STARTING', MATCH_STARTED: 'MATCH STARTED',
    MATCH_PAUSED: 'MATCH PAUSED', MATCH_RESUMED: 'MATCH RESUMED', MATCH_COMPLETED: 'MATCH COMPLETED',
    RESULT_PUBLISHED: 'RESULT PUBLISHED', NEXT_ROUND: 'NEXT ROUND',
    STREAM_RECONNECTING: 'RECONNECTING…', TECHNICAL_DIFFICULTIES: 'TECHNICAL DIFFICULTIES',
    BROADCAST_ENDED: 'BROADCAST ENDED',
  }[ev.type] || ev.type;
  wrap.innerHTML = '<div class="e1 cond">'+esc(label)+'</div><div class="e2">'+esc('BATTLE OFF FRIENDS — STIKAR ESPORTS')+'</div>';
  const dur = ev.type==='LIVE_NOW' || ev.type==='LIVE_STARTING' ? 6000 : 3800;
  eventShownUntil = Date.now() + dur;
  setTimeout(()=>{ if (Date.now() >= eventShownUntil - 50) wrap.innerHTML=''; }, dur);
}

function renderRows(rows){
  const box = $('#lbrows');
  box.innerHTML = rows.map((r)=>{
    const cls = r.rank===1?'row top1':r.rank===2?'row top2':r.rank===3?'row top3':'row';
    return '<div class="'+cls+'">'
      + '<span class="rk stat">'+r.rank+'</span>'
      + '<span class="tm"><span class="n">'+esc(r.teamName)+'</span><span class="tag">['+esc(r.teamTag||'')+"] · MAIN "+r.matchesPlayed+'x</span></span>'
      + '<span class="kl">'+r.kills+'</span>'
      + '<span class="pt stat">'+r.totalPoints+'</span>'
      + '</div>';
  }).join('');
}

// ---------- Video: WHE (WebRTC) + fallback HLS ----------
let pcHandle = null, hlsHandle = null, attemptTimer = null;
const MAX_ATTEMPTS = 3;

async function tryWhe(){
  const video = $('#video');
  if (!video) return false;
  try {
    const pc = new RTCPeerConnection();
    pc.addTransceiver('video', {direction:'recvonly'});
    pc.addTransceiver('audio', {direction:'recvonly'});
    pc.ontrack = (e)=>{ video.srcObject = e.streams[0]; };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise((res)=>{ if(pc.iceGatheringState==='complete') return res(); const t=setTimeout(res,2500); pc.addEventListener('icegatheringstatechange',()=>{ if(pc.iceGatheringState==='complete'){clearTimeout(t);res();} }); });
    const r = await fetch(WHE_URL, {method:'POST', headers:{'Content-Type':'application/sdp'}, body: pc.localDescription.sdp});
    if (!r.ok) { pc.close(); return false; }
    await pc.setRemoteDescription({type:'answer', sdp: await r.text()});
    const ok = await new Promise((res)=>{
      const t0 = Date.now();
      const iv = setInterval(()=>{
        if (pc.connectionState==='connected'){clearInterval(iv);res(true);}
        else if (pc.connectionState==='failed'||pc.connectionState==='closed'){clearInterval(iv);res(false);}
        else if (Date.now()-t0>7000){clearInterval(iv);res(false);}
      },300);
    });
    if (!ok){ pc.close(); return false; }
    pcHandle = {pc};
    video.muted = true;
    try { await video.play(); } catch { showPlayButton(); }
    onConnected('WebRTC');
    return true;
  } catch { return false; }
}

async function tryHls(){
  const video = $('#video');
  if (!video) return false;
  try {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = HLS_URL;
      await video.play().catch(()=>showPlayButton());
      onConnected('HLS');
      return true;
    }
    await loadHlsLib();
    const Hls = window.Hls;
    if (!Hls || !Hls.isSupported()) return false;
    const hls = new Hls({lowLatencyMode:true});
    hls.loadSource(HLS_URL);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_,d)=>{ if(d.fatal) onLost('HLS stream error'); });
    hlsHandle = hls;
    await video.play().catch(()=>showPlayButton());
    onConnected('HLS');
    return true;
  } catch { return false; }
}

function loadHlsLib(){
  return new Promise((res)=>{
    if (window.Hls) return res();
    const s = document.createElement('script');
    s.src = '/assets/hls.min.js';
    s.onload = ()=>res(); s.onerror = ()=>res();
    document.head.appendChild(s);
  });
}

function showPlayButton(){
  const btn = $('#playbtn');
  if (btn) btn.style.display = 'grid';
}

async function connectStream(attempt=1){
  setStatus('connecting', attempt);
  const whe = await tryWhe();
  if (whe) return;
  setStatus('connecting', attempt, 'WebRTC gagal — mencoba HLS…');
  const hls = await tryHls();
  if (hls) return;
  if (attempt < MAX_ATTEMPTS) {
    attemptTimer = setTimeout(()=>connectStream(attempt+1), 1800*attempt);
  } else {
    onLost('Server siaran lokal belum aktif atau MediaMTX belum berjalan. Video akan muncul otomatis saat siaran dimulai.');
  }
}

function setStatus(mode, attempt, extra){
  const el = $('#conn');
  if (!el) return;
  el.style.display = 'flex';
  if (mode==='connecting'){
    el.innerHTML = '<div class="spin"></div><div class="big cond" style="color:var(--cyan)">MENGHUBUNGKAN STREAM'+(attempt>1?' ('+attempt+'/'+MAX_ATTEMPTS+')':'')+'</div><div class="sm">'+esc(extra||'Menyambung ke server siaran lokal…')+'</div>';
  }
}

function onConnected(via){
  const el = $('#conn'); if (el) el.style.display='none';
  const badge = $('#streambadge'); if (badge) badge.textContent = 'SIGNAL: OK · '+via;
  const st = $('#connstatus'); if (st) { st.textContent='CONNECTED'; st.className='badge'; st.style.color='var(--ok)'; st.style.borderColor='var(--ok)'; }
}

function onLost(msg){
  if (attemptTimer) clearTimeout(attemptTimer);
  const el = $('#conn');
  if (el) el.innerHTML = '<div style="font-size:34px">📡</div><div class="big cond" style="color:var(--gold)">SIGNAL LOST</div><div class="sm">'+esc(msg||'')+'</div><button class="playbtn" onclick="connectStream(1)" title="Coba lagi">↻</button>';
  const st = $('#connstatus'); if (st) { st.textContent='RECONNECTING'; st.style.color='var(--gold)'; st.style.borderColor='var(--gold)'; }
  // Auto-retry pelan (bukan loop tanpa akhir): 1x lagi setelah 15 detik
  setTimeout(()=>{ if (!$('#video').srcObject && !$('#video').src) connectStream(1); }, 15000);
}

// ---------- Jam broadcast ----------
setInterval(()=>{
  const el = $('#clock');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID');
}, 1000);

window.addEventListener('load', ()=>{
  pollData();
  connectStream(1);
  const pb = $('#playbtn');
  if (pb) pb.addEventListener('click', ()=>{
    const v = $('#video');
    if (v) v.play().then(()=>{ pb.style.display='none'; });
  });
});
`;
}

function pageShell({ tid, projectId, role, body, extraHead = '', wheUrl, hlsUrl }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>STIKAR ESPORTS — ${role === 'display' ? 'TV DISPLAY' : 'LIVE'} · BATTLE OFF FRIENDS</title>
<style>${CSS}</style>
${extraHead}
</head>
<body>
${body}
<script>
const WHE_URL = ${JSON.stringify(wheUrl)};
const HLS_URL = ${JSON.stringify(hlsUrl)};
${sharedScript({ tid, projectId, role })}
</script>
</body>
</html>`;
}

export function renderDisplayPage({ tid, projectId = 'turnamenffbof', mediamtxPath }) {
  const wheUrl = `/mediamtx/${mediamtxPath}/whe`;
  const hlsUrl = `/hls/${mediamtxPath}/index.m3u8`;
  const body = `
<div id="app">
  <header>
    <div class="brand">
      <span class="logo cond">Z</span>
      <div>
        <h1 class="cond">STIKAR <b>ESPORTS</b></h1>
        <p>BATTLE OFF FRIENDS · SMK TI BALI GLOBAL KARANGASEM</p>
      </div>
    </div>
    <div class="matchinfo cond">
      <div class="t">MATCH INFORMATION</div>
      <div class="m"><span id="matchround">ROUND —</span> · <b id="matchmap">NOT SET</b></div>
    </div>
    <div class="rightinfo">
      <span id="connstatus" class="badge">CONNECTING</span>
      <span id="livebadge" class="off">STANDBY</span>
      <span class="clock stat" id="clock">--:--:--</span>
    </div>
  </header>
  <main>
    <section class="stage" id="livewrap">
      <video id="video" autoplay muted playsinline></video>
      <div class="conn" id="conn">
        <div class="spin"></div>
        <div class="big cond" style="color:var(--cyan)">MENGHUBUNGKAN STREAM…</div>
        <div class="sm">Video gameplay muncul otomatis ketika siaran lokal sudah berjalan.</div>
      </div>
      <button class="playbtn" id="playbtn" style="display:none;position:absolute;z-index:5">▶</button>
      <div class="eventbanner" id="eventbanner"></div>
      <div class="emg" id="emergency" style="display:none">
        <h1 class="cond" id="emg-title">TECHNICAL DIFFICULTIES</h1>
        <p id="emg-msg"></p>
        <p class="badge">SKOR RESMI TIDAK TERPENGARUH</p>
      </div>
    </section>
    <aside class="side">
      <div class="lb-head cond">
        <h2>LIVE STANDINGS</h2>
        <span id="dbstatus" class="badge" style="color:var(--gold)">MENGHUBUNGKAN…</span>
      </div>
      <div class="lb-rows" id="lbrows"></div>
      <div class="lb-foot cond"><span>SCORING RESMI BOF</span><span id="updatedat" class="stat">UPDATE ${esc('—')}</span></div>
    </aside>
  </main>
  <footer>
    <div class="ticker"><div class="track" id="tickertrack"><b>▸</b> BATTLE OFF FRIENDS — memuat informasi…</div></div>
  </footer>
</div>`;
  return pageShell({ tid, projectId, role: 'display', body, wheUrl, hlsUrl });
}

export function renderLivePage({ tid, projectId = 'turnamenffbof', mediamtxPath }) {
  const wheUrl = `/mediamtx/${mediamtxPath}/whe`;
  const hlsUrl = `/hls/${mediamtxPath}/index.m3u8`;
  const body = `
<div id="app">
  <header>
    <div class="brand">
      <span class="logo cond">Z</span>
      <div>
        <h1 class="cond">STIKAR <b>ESPORTS</b> · LIVE</h1>
        <p>BATTLE OFF FRIENDS</p>
      </div>
    </div>
    <div class="matchinfo cond">
      <div class="m"><span id="matchround">ROUND —</span> · <b id="matchmap">NOT SET</b></div>
    </div>
    <div class="rightinfo"><span id="livebadge" class="off">STANDBY</span></div>
  </header>
  <main style="flex-direction:column">
    <section class="stage" style="min-height:54vh">
      <video id="video" autoplay muted playsinline controls></video>
      <div class="conn" id="conn">
        <div class="spin"></div>
        <div class="big cond" style="color:var(--cyan)">MENGHUBUNGKAN STREAM…</div>
        <div class="sm">Tonton lewat jaringan lokal — video muncul saat siaran aktif.</div>
      </div>
      <div class="eventbanner" id="eventbanner"></div>
    </section>
    <aside class="side" style="flex:none;border-top:1px solid var(--edge);border-left:0;max-height:44vh">
      <div class="lb-head cond"><h2>LIVE STANDINGS</h2><span id="dbstatus" class="badge">…</span></div>
      <div class="lb-rows" id="lbrows"></div>
    </aside>
  </main>
</div>`;
  return pageShell({ tid, projectId, role: 'viewer', body, wheUrl, hlsUrl });
}

export function renderInfoPage({ port, lanIp, mediamtx }) {
  const disp = lanIp ? `http://${lanIp}:${port}/display` : '(IP LAN belum terdeteksi)';
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>STIKAR Local Gateway</title><style>${CSS}</style></head>
<body>
<div class="info">
  <h1 class="cond">STIKAR <span style="color:var(--fire)">LOCAL GATEWAY</span></h1>
  <p style="color:var(--muted);font-size:14px">Server siaran lokal laptop berjalan. Buka link di bawah dari TV / HP yang terhubung ke Wi-Fi atau hotspot yang sama.</p>
  <div class="card">
    <h2 class="cond">STATUS SERVER</h2>
    <div class="rowl"><span>Gateway</span><span class="ok">RUNNING · port ${port}</span></div>
    <div class="rowl"><span>IP LAN laptop</span><span class="stat">${esc(lanIp ?? '—')}</span></div>
    <div class="rowl"><span>MediaMTX</span><span class="${mediamtx ? 'ok' : 'bad'}">${mediamtx ? 'BERJALAN' : 'BELUM BERJALAN'}</span></div>
  </div>
  <div class="card links">
    <h2 class="cond">TAUTAN SIARAN</h2>
    <div class="rowl"><span>TV Display (utama)</span><a href="/display">${esc(disp)}</a></div>
    <div class="rowl"><span>Live viewer</span><a href="/live">/live</a></div>
    <div class="rowl"><span>Status API</span><a href="/api/status">/api/status</a></div>
  </div>
  <p style="margin-top:16px;color:var(--muted);font-size:11px;letter-spacing:.2em" class="cond">STIKAR ESPORTS — DEVELOPED BY SAPUTRA DEVELOPER</p>
</div>
</body></html>`;
}
