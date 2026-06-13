/* FRC Skill Trees — application logic */
import { TREES } from './data/trees.js';
import {
  auth, db,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  collection, doc, getDoc, setDoc, updateDoc, onSnapshot,
  listMentors, addMentor, removeMentor,
} from './firebase.js';

// ═══════════════════════════════════════════════════════
// LAYOUT ENGINE
// ═══════════════════════════════════════════════════════
let NW=164, NH=72, CG=60; // increased CG from 44 to 60 for better spacing
let LANE_H=20, STUB=24, CHAN_CLEAR=16, LANE_W=16, RG_MIN=48; // increased CHAN_CLEAR and LANE_W
let RC=18; // edge corner radius — scaled with layout constants at render time

// ── RADIAL TREE LAYOUT ──────────────────────────────────
function layout(nodes) {
  // 1. Rank assignment (longest path from roots)
  const rank = {};
  nodes.forEach(n => { rank[n.id] = 0; });
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach(n => {
      n.prereqs.forEach(pid => {
        if (rank[pid] + 1 > rank[n.id]) { rank[n.id] = rank[pid] + 1; changed = true; }
      });
    });
  }
  const maxRank = Math.max(...nodes.map(n => rank[n.id]));

  // 2. Group by rank
  const byRank = {};
  nodes.forEach(n => {
    const r = rank[n.id];
    if (!byRank[r]) byRank[r] = [];
    byRank[r].push(n);
  });

  // 3. Radial positioning: place nodes in rings around center
  const pos = {};
  const radiusStart = 150;
  const radiusStep = 160;

  // Calculate actual canvas dimensions based on max radius
  const maxRadius = radiusStart + maxRank * radiusStep + NW;
  const cw = maxRadius * 2 + 60;
  const ch = maxRadius * 2 + 60;
  const centerX = cw / 2;
  const centerY = ch / 2;

  Object.keys(byRank).map(Number).sort((a,b)=>a-b).forEach(r => {
    const nodeCount = byRank[r].length;
    const radius = radiusStart + r * radiusStep;
    const angleStep = (2 * Math.PI) / Math.max(nodeCount, 1);

    byRank[r].forEach((node, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      pos[node.id] = { x: Math.round(x - NW/2), y: Math.round(y - NH/2) };
    });
  });

  return { pos, rank, cw, ch };
}

// ── HORIZONTAL LAYOUT (safety tree — serial chain, left-to-right) ──────────
function layoutHoriz(nodes) {
  const rank = {};
  nodes.forEach(n => { rank[n.id] = 0; });
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach(n => {
      n.prereqs.forEach(pid => {
        if (rank[pid] + 1 > rank[n.id]) { rank[n.id] = rank[pid] + 1; changed = true; }
      });
    });
  }
  const pos = {};
  nodes.forEach(n => { pos[n.id] = { x: rank[n.id] * (NW + CG), y: 0 }; });
  const maxRank = Math.max(...nodes.map(n => rank[n.id]));
  return { pos, cw: maxRank * (NW + CG) + NW, ch: NH };
}

// ── RADIAL EDGE PATH ────────────────────────────────────
// Simple curved path from parent to child radiating outward
function edgePath(pos, rank, srcId, dstId) {
  const sp = pos[srcId], dp = pos[dstId];
  const x1 = sp.x + NW/2, y1 = sp.y + NH/2;
  const x2 = dp.x + NW/2, y2 = dp.y + NH/2;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
}


// ── HORIZONTAL EDGE PATH (safety tree — straight horizontal lines) ──────────
function edgePathHoriz(pos, srcId, dstId) {
  const sp = pos[srcId], dp = pos[dstId];
  const y = sp.y + NH / 2;
  return `M${sp.x + NW},${y} L${dp.x},${y}`;
}

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let students = {};          // { uid: progressMap } — loaded from Firestore /students collection
let displayNames = {};      // { uid: displayName } — populated alongside students
let cur = null;             // currently selected student name
let selNode = null, selTree = null, view = 'ov', curTree = 'safety';
let userRole = 'student';   // 'mentor' | 'student'
let isAdmin = false;        // G3ID site admin — can manage the mentor list
let currentUser = null;
let unsubStudents = null;   // Firestore listener cleanup function

function gst(id) { return cur && students[cur] ? (students[cur][id] || 'not-started') : 'not-started'; }
function unlocked(node,tree){
  if(tree.gate==='safety'){const st=TREES.find(t=>t.id==='safety');if(!st.nodes.every(n=>gst(n.id)==='complete'))return false;}
  return node.prereqs.every(pid=>gst(pid)==='complete');
}
function dsp(node,tree){const r=gst(node.id);if(!unlocked(node,tree))return'locked';return r==='not-started'?'available':r;}
function sdone(){return TREES.find(t=>t.id==='safety').nodes.every(n=>gst(n.id)==='complete');}
function tprog(tree){const t=tree.nodes.length,d=tree.nodes.filter(n=>gst(n.id)==='complete').length,p=tree.nodes.filter(n=>gst(n.id)==='in-progress').length;return{t,d,p};}
function findN(id){for(const t of TREES){const n=t.nodes.find(n=>n.id===id);if(n)return{node:n,tree:t};}return null;}

// ═══════════════════════════════════════════════════════
// AUTH & FIREBASE
// ═══════════════════════════════════════════════════════

async function initApp(user) {
  currentUser = user;

  // Determine role: mentors have a document in /mentors/{uid}
  try {
    const mentorSnap = await getDoc(doc(db, 'mentors', user.uid));
    userRole = mentorSnap.exists() ? 'mentor' : 'student';
  } catch(e) {
    userRole = 'student';
  }

  // Site admins manage the mentor list — reveal the Mentors tab for them.
  isAdmin = !!user.isAdmin;
  document.getElementById('navMn').style.display = isAdmin ? '' : 'none';

  // Hide login screen, restore tree-selector initial state
  document.getElementById('loginScreen').classList.add('hidden');
  document.querySelector('.tree-sel-wrap').classList.add('hidden');

  // Real-time listener for all students — fires immediately with cached data,
  // then again on every change from any client.
  unsubStudents = onSnapshot(collection(db, 'students'), snapshot => {
    const fresh = {}, freshNames = {};
    snapshot.forEach(d => {
      const data = d.data();
      fresh[d.id]      = data.progress    || {};
      freshNames[d.id] = data.displayName || d.id; // fall back to UID if field missing
    });
    students     = fresh;
    displayNames = freshNames;

    // Helper: sort UIDs by their display name
    const byName = (a, b) => (displayNames[a] || a).localeCompare(displayNames[b] || b);
    const sortedUids = Object.keys(students).sort(byName);

    if (!cur) {
      // First load: students land on their own profile (doc ID = their UID);
      // mentors fall back to the first student sorted by display name.
      cur = students[currentUser.uid] ? currentUser.uid : (sortedUids[0] || null);
    } else if (!students[cur]) {
      // Selected student no longer exists — fall back gracefully.
      cur = sortedUids[0] || null;
    }

    if (view === 'ov') renderOv();
    else renderTrees();
  });
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');

  if (!email || !pw) { errEl.textContent = 'Please enter your email and password.'; return; }

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    // onAuthStateChanged fires → initApp()
  } catch(e) {
    const known = ['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'];
    errEl.textContent = known.includes(e.code)
      ? 'Incorrect email or password.'
      : 'Sign-in failed. Check your connection and try again.';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function doLogout() {
  if (unsubStudents) { unsubStudents(); unsubStudents = null; }
  students = {}; displayNames = {}; cur = null; userRole = 'student'; currentUser = null;
  closePanel();
  await signOut(auth);
  // Reset login form
  document.getElementById('loginEmail').value    = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginBtn').disabled   = false;
  document.getElementById('loginBtn').textContent = 'Sign In';
  document.getElementById('loginScreen').classList.remove('hidden');
}

// Persist a single skill update to Firestore (fire-and-forget; optimistic UI)
function saveSkill(skillId, status) {
  if (!cur) return;
  updateDoc(doc(db, 'students', cur), { [`progress.${skillId}`]: status })
    .catch(() => {
      // Document may not exist yet — create it
      setDoc(doc(db, 'students', cur), { progress: { [skillId]: status } }, { merge: true });
    });
}

// Auth state listener — fires on page load and on every sign-in/sign-out
onAuthStateChanged(auth, user => {
  if (user) {
    initApp(user);
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
  }
});

// Login form keyboard shortcuts
document.getElementById('loginEmail').addEventListener('keydown',    e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ═══════════════════════════════════════════════════════
// VIEW SWITCH
// ═══════════════════════════════════════════════════════
function go(v){
  view=v;
  document.getElementById('vOv').classList.toggle('act',v==='ov');
  document.getElementById('vTr').classList.toggle('act',v==='tr');
  document.getElementById('vMn').classList.toggle('act',v==='mn');
  document.getElementById('navOv').classList.toggle('act',v==='ov');
  document.getElementById('navTr').classList.toggle('act',v==='tr');
  document.getElementById('navMn').classList.toggle('act',v==='mn');
  // Tree selector only visible on skill trees tab
  document.querySelector('.tree-sel-wrap').classList.toggle('hidden',v!=='tr');
  if(v==='mn')renderMentors();else if(v==='ov')renderOv();else renderTrees();
}

// ═══════════════════════════════════════════════════════
// MENTOR MANAGEMENT (admin only)
// ═══════════════════════════════════════════════════════
async function renderMentors(){
  const wrap=document.getElementById('mnWrap');
  wrap.innerHTML='<div class="mn-empty">Loading…</div>';
  const mentors=await listMentors();
  const mentorIds=new Set(mentors.map(m=>m.id));
  const byName=(a,b)=>(displayNames[a]||a).localeCompare(displayNames[b]||b);
  const candidates=Object.keys(students).filter(uid=>!mentorIds.has(uid)).sort(byName);
  const rows=mentors.slice().sort((a,b)=>(a.displayName||a.id).localeCompare(b.displayName||b.id))
    .map(m=>`<div class="mn-row"><div class="mn-name">${m.displayName||m.id}</div><button class="mn-rm" onclick="mnRemove('${m.id}')">Remove</button></div>`).join('');
  wrap.innerHTML=`
    <div class="mn-add">
      <select id="mnSel"><option value="">Add a mentor…</option>${candidates.map(uid=>`<option value="${uid}">${displayNames[uid]||uid}</option>`).join('')}</select>
      <button class="mn-add-btn" onclick="mnAdd()">Add</button>
    </div>
    <div class="mn-list">${rows||'<div class="mn-empty">No mentors yet.</div>'}</div>`;
}
async function mnAdd(){
  const uid=document.getElementById('mnSel').value;
  if(!uid)return;
  await addMentor(uid);
  renderMentors();
}
async function mnRemove(uid){
  await removeMentor(uid);
  renderMentors();
}

// ── Tree selector (mobile) ─────────────────────────────
function buildTreeSel(){
  const s=document.getElementById('treeSel');s.innerHTML='';
  TREES.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.icon+' '+t.name;if(t.id===curTree)o.selected=true;s.appendChild(o);});
}
function onTreeSel(){curTree=document.getElementById('treeSel').value;if(view==='tr')renderTrees();}

// ── Student selector ───────────────────────────────────
function renderSel(){
  const s=document.getElementById('ssel');s.innerHTML='';
  const byName=(a,b)=>(displayNames[a]||a).localeCompare(displayNames[b]||b);
  Object.keys(students).sort(byName).forEach(uid=>{const o=document.createElement('option');o.value=uid;o.textContent=displayNames[uid]||uid;if(uid===cur)o.selected=true;s.appendChild(o);});
}
document.getElementById('ssel').addEventListener('change',e=>{cur=e.target.value;closePanel();if(view==='ov')renderOv();else renderTrees();});

// ═══════════════════════════════════════════════════════
// OVERVIEW RENDER
// ═══════════════════════════════════════════════════════
const TC=TREES.map(t=>t.color);

function renderOv(){
  renderSel();buildTreeSel();
  const grid=document.getElementById('ovGrid');grid.innerHTML='';
  TREES.forEach((tree,ti)=>{
    const color=tree.color;
    const byName=(a,b)=>(displayNames[a]||a).localeCompare(displayNames[b]||b);
    const sdata=Object.keys(students).sort(byName).map(uid=>{
      const tot=tree.nodes.length;
      const done=tree.nodes.filter(n=>((students[uid]||{})[n.id]||'not-started')==='complete').length;
      return{name:displayNames[uid]||uid,done,tot,pct:tot?Math.round(done/tot*100):0};
    });
    const avgDone=sdata.length?Math.round(sdata.reduce((a,s)=>a+s.done,0)/sdata.length):0;
    const avgPct=tree.nodes.length?Math.round(avgDone/tree.nodes.length*100):0;
    const card=document.createElement('div');card.className='ov-card';
    card.onclick=()=>{curTree=tree.id;go('tr');};
    card.innerHTML=`
      <div class="ov-head"><div class="ov-icon">${tree.icon}</div><div><div class="ov-name">${tree.name}</div><div class="ov-count">${tree.nodes.length} skills</div></div></div>
      <div class="ov-bar-bg"><div class="ov-bar-fill" style="width:${avgPct}%;background:${color}"></div></div>
      <div class="ov-stats"><span>Team avg</span><span class="d">${avgDone}/${tree.nodes.length}</span></div>
      <div class="ov-rows">${sdata.map(s=>`<div class="ov-row"><div class="ov-sn">${s.name}</div><div class="ov-sb"><div class="ov-sf" style="width:${s.pct}%;background:${color};opacity:0.7"></div></div><div class="ov-sp">${s.pct}%</div></div>`).join('')}</div>
    `;
    grid.appendChild(card);
  });
  const allN=TREES.reduce((a,t)=>a+t.nodes.length,0);
  const byName=(a,b)=>(displayNames[a]||a).localeCompare(displayNames[b]||b);
  const rows=Object.keys(students).sort(byName).map(uid=>{
    const done=TREES.reduce((a,t)=>a+t.nodes.filter(n=>((students[uid]||{})[n.id]||'not-started')==='complete').length,0);
    const prog=TREES.reduce((a,t)=>a+t.nodes.filter(n=>((students[uid]||{})[n.id]||'not-started')==='in-progress').length,0);
    return{name:displayNames[uid]||uid,done,prog,pct:allN?Math.round(done/allN*100):0};
  });
  document.getElementById('sumWrap').innerHTML=`
    <table class="sum-table">
      <thead><tr><th>Student</th><th>Complete</th><th>In Progress</th><th>Overall</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td class="td-nm">${r.name}</td><td class="td-dn">${r.done}</td><td class="td-pr">${r.prog}</td>
        <td><div class="td-br"><div class="td-bb"><div class="td-bf" style="width:${r.pct}%;background:var(--done-b)"></div></div><div class="td-bp">${r.pct}%</div></div></td>
      </tr>`).join('')}</tbody>
    </table>`;
}

// ═══════════════════════════════════════════════════════
// TREE RENDER
// Desktop: safety (horizontal) → gate banner → 8 trees in a scrollable row.
// Mobile:  single curTree only.
// ═══════════════════════════════════════════════════════
function isNarrow(){return window.innerWidth<700;}

function renderTrees(){
  renderSel();buildTreeSel();

  // Preserve scroll position so a Firestore update doesn't jump the view
  const treeArea=document.getElementById('treeArea');
  const scrollTop=treeArea.scrollTop,scrollLeft=treeArea.scrollLeft;

  const narrow=isNarrow();

  // Scale layout constants 1.5× on desktop, 1× on mobile.
  {const _s=narrow?1:1.5;
   NW=Math.round(164*_s);NH=Math.round(72*_s);CG=Math.round(44*_s);
   LANE_H=Math.round(20*_s);STUB=Math.round(24*_s);CHAN_CLEAR=Math.round(8*_s);
   LANE_W=Math.round(10*_s);RG_MIN=Math.round(48*_s);RC=Math.round(18*_s);}

  const c=document.getElementById('treesC');c.innerHTML='';
  const sc=sdone();
  const banner=document.createElement('div');
  banner.className='gate'+(sc?' ok':'');
  banner.innerHTML=sc?'✦ &nbsp;Safety complete — all trees unlocked.':'🔒 &nbsp;Complete the Safety tree (100%) to unlock all other skill trees.';

  // Shared helper: add clickable node divs to a nodes-layer element
  function addNodes(nl,tree,pos){
    tree.nodes.forEach(node=>{
      const p=pos[node.id];if(!p)return;
      const ds=dsp(node,tree);
      const isSel=selNode&&selNode.id===node.id;
      const el=document.createElement('div');
      el.className=`node ${ds}${node.convergence?' convergence':''}${isSel?' sel':''}`;
      el.dataset.nodeId=node.id;
      el.style.cssText=`left:${p.x}px;top:${p.y}px;width:${NW}px;min-height:${NH}px;`;
      if(ds==='locked'){
        el.innerHTML=`<div class="n-top"><div class="n-label">${node.label}</div><div class="n-lock">🔒</div></div><div class="n-sub">${node.sub}</div>`;
      }else{
        el.innerHTML=`<div class="n-top"><div class="n-label">${node.label}</div><div class="n-dot"></div></div><div class="n-sub">${node.sub}</div>`;
      }
      el.addEventListener('click',()=>openPanel(node,tree));
      nl.appendChild(el);
    });
  }

  // Safety tree: horizontal layout, straight horizontal edges
  function makeSafetyBlock(tree){
    const block=document.createElement('div');block.className='tree-block';
    const{t,d}=tprog(tree);
    block.innerHTML=`<div class="t-hdr"><div class="t-icon">${tree.icon}</div><div><div class="t-name">${tree.name}</div><div class="t-sub">${tree.subtitle}</div></div><div class="t-pill"><span class="d">${d}</span> / ${t}</div></div>`;
    const{pos,cw,ch}=layoutHoriz(tree.nodes);
    block.style.width=cw+'px';
    const wrap=document.createElement('div');wrap.className='canvas-wrap';wrap.style.width=cw+'px';wrap.style.height=(ch+16)+'px';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width',cw);svg.setAttribute('height',ch+16);svg.classList.add('tree-svg');
    tree.nodes.forEach(node=>{
      node.prereqs.forEach(pid=>{
        const fn=tree.nodes.find(n=>n.id===pid);
        const fds=dsp(fn,tree);
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',edgePathHoriz(pos,pid,node.id));
        path.dataset.srcId=pid;
        let cls='edge ';
        if(fds==='complete')cls+='ec';else if(fds==='in-progress')cls+='ep';else if(fds==='available')cls+='ea';else cls+='el';
        path.setAttribute('class',cls);svg.appendChild(path);
      });
    });
    wrap.appendChild(svg);
    const nl=document.createElement('div');nl.className='nodes-layer';nl.style.cssText=`position:relative;width:${cw}px;height:${ch+16}px;`;
    addNodes(nl,tree,pos);
    wrap.appendChild(nl);block.appendChild(wrap);
    return block;
  }

  // All other trees: radial layout
  function makeVertBlock(tree){
    const block=document.createElement('div');block.className='tree-block';
    const{t,d}=tprog(tree);
    block.innerHTML=`<div class="t-hdr"><div class="t-icon">${tree.icon}</div><div><div class="t-name">${tree.name}</div><div class="t-sub">${tree.subtitle}</div></div><div class="t-pill"><span class="d">${d}</span> / ${t}</div></div>`;
    const{pos,rank,cw,ch}=layout(tree.nodes);
    block.style.width=cw+'px';
    const wrap=document.createElement('div');wrap.className='canvas-wrap';wrap.style.width=cw+'px';wrap.style.height=(ch+16)+'px';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width',cw);svg.setAttribute('height',ch+16);svg.classList.add('tree-svg');
    tree.nodes.forEach(node=>{
      node.prereqs.forEach(pid=>{
        const fn=tree.nodes.find(n=>n.id===pid);
        const fds=dsp(fn,tree);
        const d=edgePath(pos,rank,pid,node.id);
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',d);path.dataset.srcId=pid;
        let cls='edge ';
        if(fds==='complete')cls+='ec';else if(fds==='in-progress')cls+='ep';else if(fds==='available')cls+='ea';else cls+='el';
        if(node.convergence)cls+=' edash';
        path.setAttribute('class',cls);svg.appendChild(path);
      });
    });
    wrap.appendChild(svg);
    const nl=document.createElement('div');nl.className='nodes-layer';nl.style.cssText=`position:relative;width:${cw}px;height:${ch+16}px;`;
    addNodes(nl,tree,pos);
    wrap.appendChild(nl);block.appendChild(wrap);
    return block;
  }

  const safetyTree=TREES.find(t=>t.id==='safety');
  const otherTrees=TREES.filter(t=>t.id!=='safety');

  if(narrow){
    // Mobile: gate banner, then single selected tree
    c.appendChild(banner);
    const tree=TREES.find(t=>t.id===curTree);
    if(tree){
      const block=tree.id==='safety'?makeSafetyBlock(tree):makeVertBlock(tree);
      c.appendChild(block);
      // Fix container width so margin:auto can center it
      c.style.width=block.style.width||'';
    }else{
      c.style.width='';
    }
  }else{
    // Desktop: safety (horizontal) at top, gate banner, then 8 trees in a non-wrapping row
    c.style.width='';
    c.appendChild(makeSafetyBlock(safetyTree));
    c.appendChild(banner);
    const row=document.createElement('div');row.className='trees-row';
    otherTrees.forEach(tree=>row.appendChild(makeVertBlock(tree)));
    c.appendChild(row);
  }

  // Restore scroll after DOM rebuild
  treeArea.scrollTop=scrollTop;treeArea.scrollLeft=scrollLeft;
}

// ═══════════════════════════════════════════════════════
// PANEL
// ═══════════════════════════════════════════════════════
function toggleDropdown(id) {
  const content = document.getElementById(id + 'Content');
  if (content) {
    content.classList.toggle('open');
    const header = content.previousElementSibling;
    if (header) header.classList.toggle('open');
  }
}

function openPanel(node,tree){
  selNode=node;selTree=tree;
  const ds=dsp(node,tree),raw=gst(node.id);
  document.getElementById('pTag').textContent=tree.icon+'  '+tree.name.toUpperCase();
  document.getElementById('pTitle').textContent=node.label;
  document.getElementById('pDesc').textContent=node.desc;
  const badge=document.getElementById('pBadge');badge.className='sbadge '+ds;
  document.getElementById('pSt').textContent={locked:'Locked',available:'Available','in-progress':'In Progress',complete:'Complete'}[ds];

  // Open Description section by default
  const descContent = document.getElementById('descContent');
  const descHeader = descContent ? descContent.previousElementSibling : null;
  if (descContent && descHeader) {
    descContent.classList.add('open');
    descHeader.classList.add('open');
  }

  const psec=document.getElementById('pPreSec'),plist=document.getElementById('pPre');plist.innerHTML='';
  if(!node.prereqs.length){psec.style.display='none';}else{
    psec.style.display='block';
    node.prereqs.forEach(pid=>{const f=findN(pid);if(!f)return;const ps=gst(pid);const cls=ps==='complete'?'done':ps==='in-progress'?'prog':'none';const it=document.createElement('div');it.className='pr-item '+cls;it.innerHTML=`<div class="pr-dot"></div>${f.node.label}`;plist.appendChild(it);});
  }

  // Show Update Progress section only for mentors
  const updateSec = document.getElementById('pUpdateSec');
  if (updateSec) updateSec.style.display = userRole === 'mentor' ? '' : 'none';

  const locked=ds==='locked';
  ['bNS','bIP','bC'].forEach(id=>{document.getElementById(id).disabled=locked;document.getElementById(id).classList.remove('act');});
  if(!locked){document.getElementById(raw==='not-started'?'bNS':raw==='in-progress'?'bIP':'bC').classList.add('act');}
  document.getElementById('pFoot').textContent=node.convergence?'◈ Convergence node — all prerequisites must be complete to unlock.':'';
  document.getElementById('panel').classList.add('open');
  document.getElementById('panelOverlay').classList.add('open');
  document.querySelectorAll('.node.sel').forEach(el=>el.classList.remove('sel'));
  const selEl=document.querySelector('[data-node-id="'+node.id+'"]');
  if(selEl)selEl.classList.add('sel');
}
function closePanel(){
  selNode=null;selTree=null;
  document.getElementById('panel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('open');
  document.querySelectorAll('.node.sel').forEach(el=>el.classList.remove('sel'));
  // Reset all sections to collapsed
  document.querySelectorAll('.sec-content').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.sec-header').forEach(el=>el.classList.remove('open'));
}
function setSt(s){
  if(!selNode||userRole!=='mentor')return;
  if(!students[cur])students[cur]={};
  students[cur][selNode.id]=s;
  // Refresh node visual states without full re-render (preserves scroll)
  document.querySelectorAll('.node[data-node-id]').forEach(el=>{
    const nid=el.dataset.nodeId;
    const found=findN(nid);
    if(!found)return;
    const ds=dsp(found.node,found.tree);
    const isSel=selNode&&selNode.id===nid;
    const wasLocked=el.classList.contains('locked');
    el.className='node '+ds+(found.node.convergence?' convergence':'')+(isSel?' sel':'');
    const lock=el.querySelector('.n-lock');
    if(lock)lock.style.display=ds==='locked'?'':'none';
    // If node just became unlocked, add click handler
    if(wasLocked&&ds!=='locked'){
      el.addEventListener('click',()=>openPanel(found.node,found.tree));
    }
  });
  // Refresh edge colors to match updated source node states
  document.querySelectorAll('path.edge[data-src-id]').forEach(path=>{
    const srcId=path.dataset.srcId;
    const found=findN(srcId);
    if(!found)return;
    const fds=dsp(found.node,found.tree);
    const isDash=path.classList.contains('edash');
    let cls='edge ';
    if(fds==='complete')cls+='ec';
    else if(fds==='in-progress')cls+='ep';
    else if(fds==='available')cls+='ea';
    else cls+='el';
    if(isDash)cls+=' edash';
    path.setAttribute('class',cls);
  });
  openPanel(selNode,selTree);
  // Persist to Firestore (optimistic — UI already updated above)
  saveSkill(selNode.id, s);
}

// Resize: re-render trees to switch between single/all-tree mode
(()=>{
  let lastW=window.innerWidth;
  window.addEventListener('resize',()=>{
    const w=window.innerWidth;
    if(w!==lastW){lastW=w;if(view==='tr')renderTrees();}
    // Ignore height-only changes (mobile browser chrome show/hide)
  });
})();

// ═══════════════════════════════════════════════════════
// EXPOSE FUNCTIONS TO WINDOW
// (Required because this file is an ES module — inline onclick
//  attributes in index.html need globally accessible functions.)
// ═══════════════════════════════════════════════════════
Object.assign(window, {
  go, onTreeSel, closePanel, setSt, doLogin, doLogout, mnAdd, mnRemove, toggleDropdown,
});
