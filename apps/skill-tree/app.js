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

// ── LAYOUT ──────────────────────────────────────────────
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

  // 2. Group by rank
  const byRank = {};
  nodes.forEach(n => {
    const r = rank[n.id];
    if (!byRank[r]) byRank[r] = [];
    byRank[r].push(n);
  });
  const maxRank = Math.max(...nodes.map(n => rank[n.id]));

  // 3. Assign x positions (centre child under avg parent)
  const pos = {};
  Object.keys(byRank).map(Number).sort((a,b)=>a-b).forEach(r => {
    byRank[r].forEach((n, i) => {
      const pxs = n.prereqs.map(pid => pos[pid] ? pos[pid].x + NW/2 : null).filter(x => x !== null);
      pos[n.id] = { x: pxs.length ? pxs.reduce((a,b)=>a+b,0)/pxs.length - NW/2 : i*(NW+CG), y: 0 };
    });
    const sorted = [...byRank[r]].sort((a,b) => pos[a.id].x - pos[b.id].x);
    for (let i = 1; i < sorted.length; i++) {
      const p = pos[sorted[i-1].id], c = pos[sorted[i].id];
      if (c.x < p.x + NW + CG) c.x = p.x + NW + CG;
    }
  });

  // 3b. Bottom-up recentering (single pass): center each parent over its
  //     adjacent-rank children. When collision resolution pushes a node right,
  //     propagate that shift to single-parent descendants only — multi-parent
  //     nodes are owned by several parents so must not be dragged by just one.
  Object.keys(byRank).map(Number).sort((a,b) => b-a).forEach(r => {
    byRank[r].forEach(n => {
      const adjKids = nodes.filter(m => m.prereqs.includes(n.id) && rank[m.id] === r + 1);
      if (!adjKids.length) return;
      const avgCx = adjKids.reduce((s, m) => s + pos[m.id].x + NW/2, 0) / adjKids.length;
      pos[n.id].x = avgCx - NW/2;
    });
    const sorted2 = [...byRank[r]].sort((a,b) => pos[a.id].x - pos[b.id].x);
    for (let i = 1; i < sorted2.length; i++) {
      const prev = pos[sorted2[i-1].id], cur = pos[sorted2[i].id];
      if (cur.x < prev.x + NW + CG) {
        const delta = prev.x + NW + CG - cur.x;
        cur.x += delta;
        // Propagate to single-parent descendants only so they stay aligned
        const q = [sorted2[i].id], seen = new Set([sorted2[i].id]);
        while (q.length) {
          const id = q.shift();
          nodes.filter(m => m.prereqs.includes(id) && m.prereqs.length === 1 && !seen.has(m.id))
               .forEach(m => { seen.add(m.id); pos[m.id].x += delta; q.push(m.id); });
        }
      }
    }
  });

  // 4. Normalise: shift so leftmost node is at x=0, snap to whole pixels.
  //    Per-rank centering is omitted — it breaks parent-child vertical
  //    alignment and produces cusps in the connecting edges.
  const allX = Object.values(pos).map(p => p.x);
  const minX = Math.min(...allX);
  Object.values(pos).forEach(p => { p.x = Math.round(p.x - minX); });
  const cw = Math.max(...Object.values(pos).map(p => p.x)) + NW;

  // 5. Collision avoidance: push nodes right to avoid overlap
  Object.keys(byRank).map(Number).sort((a,b)=>a-b).forEach(r => {
    const sorted = [...byRank[r]].sort((a,b) => pos[a.id].x - pos[b.id].x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = pos[sorted[i-1].id];
      const curr = pos[sorted[i].id];
      if (curr.x < prev.x + NW + CG) {
        curr.x = prev.x + NW + CG;
      }
    }
  });

  // 5b. Recentering pass (bottom-up): pull parents back to center over children
  Object.keys(byRank).map(Number).sort((a,b) => b-a).forEach(r => {
    byRank[r].forEach(parent => {
      const childrenInNextRank = nodes.filter(m => m.prereqs.includes(parent.id) && rank[m.id] === r + 1);
      if (!childrenInNextRank.length) return;

      // Calculate center under children
      const childCenters = childrenInNextRank.map(child => pos[child.id].x + NW/2);
      const avgChildCenter = childCenters.reduce((a,b) => a+b, 0) / childCenters.length;
      const desiredParentX = avgChildCenter - NW/2;

      // Move parent toward desired position, but not left of where it needs to be
      pos[parent.id].x = desiredParentX;
    });

    // Re-apply collision avoidance for this rank
    const sorted = [...byRank[r]].sort((a,b) => pos[a.id].x - pos[b.id].x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = pos[sorted[i-1].id];
      const curr = pos[sorted[i].id];
      if (curr.x < prev.x + NW + CG) {
        curr.x = prev.x + NW + CG;
      }
    }
  });

  // 6. Assign chanX for all non-direct edges (needed before gap sizing)
  const chanXMap = {};
  const canvasW = Math.max(...Object.values(pos).map(p => p.x)) + NW;
  nodes.forEach(n => {
    n.prereqs.forEach(pid => {
      const sp = pos[pid], dp = pos[n.id];
      if (!sp || !dp) return;
      const x1 = sp.x + NW/2, x2 = dp.x + NW/2;
      if (Math.abs(x1 - x2) < 2) return; // direct
      const nomX = (x1 + x2) / 2;
      // Snap away from card bodies and center-x stubs with generous buffers
      const intervals = [];
      nodes.forEach(m => {
        const mr = rank[m.id];
        if (mr <= rank[pid] || mr >= rank[n.id]) return;
        const mp = pos[m.id]; if (!mp) return;
        intervals.push([mp.x - CHAN_CLEAR, mp.x + NW + CHAN_CLEAR]);
      });
      nodes.forEach(m => {
        const mr = rank[m.id];
        if (mr < rank[pid] || mr > rank[n.id]) return;
        const mp = pos[m.id]; if (!mp) return;
        const cx = mp.x + NW/2;
        intervals.push([cx - LANE_W*2, cx + LANE_W*2]); // doubled buffer
      });
      const clear = x => !intervals.some(([a,b]) => x > a && x < b);
      let chanX = nomX;
      if (!clear(nomX)) {
        for (let d = LANE_W; d < canvasW; d += LANE_W) {
          if (clear(nomX - d)) { chanX = nomX - d; break; }
          if (clear(nomX + d)) { chanX = nomX + d; break; }
        }
      }
      chanXMap[pid + '->' + n.id] = isFinite(chanX) ? chanX : nomX;
    });
  });

  // 7. Per-gap interval coloring to determine track counts and assignments
  //    A "segment" is a horizontal line at some y, spanning [xL, xR].
  //    Departures: from x1 to chanX (or jog: from x1 to x2 through chanX midpoint)
  //    Arrivals:   from chanX to x2
  //    Two segments conflict ↔ their x-intervals overlap.
  //    Interval graph coloring: sort by xL, greedily assign lowest free track.

  // For each gap g, collect segments:
  //   dep: any edge with srcRank=g (non-adjacent: dep segment; adjacent: jog segment)
  //   arr: any edge with dstRank-1=g AND non-adjacent (arrival segment)
  const gapSegs = {}; // g → [{key, type, xL, xR, chanX, srcId, dstId, isDep}]
  for (let g = 0; g <= maxRank; g++) gapSegs[g] = [];

  nodes.forEach(n => {
    n.prereqs.forEach(pid => {
      const sp = pos[pid], dp = pos[n.id];
      if (!sp || !dp) return;
      const x1 = sp.x + NW/2, x2 = dp.x + NW/2;
      const srcR = rank[pid], dstR = rank[n.id];
      const adj = dstR - srcR === 1;
      const direct = Math.abs(x1 - x2) < 2;
      const key = pid + '->' + n.id;
      const chanX = direct ? x1 : chanXMap[key];
      if (!isFinite(chanX)) return;

      if (adj) {
        // Jog: use the rendered horizontal span (x1→chanX), not full x1→x2
        // because the coloring must reflect what actually gets drawn
        gapSegs[srcR].push({ key, type:'jog', xL:Math.min(x1,chanX), xR:Math.max(x1,chanX), chanX, srcId:pid, dstId:n.id, x1, x2, direct });
      } else {
        // Departure: x1 to chanX
        gapSegs[srcR].push({ key, type:'dep', xL:Math.min(x1,chanX), xR:Math.max(x1,chanX), chanX, srcId:pid, dstId:n.id, x1, x2, direct });
        // Arrival: chanX to x2
        gapSegs[dstR-1].push({ key, type:'arr', xL:Math.min(chanX,x2), xR:Math.max(chanX,x2), chanX, srcId:pid, dstId:n.id, x1, x2, direct });
      }
    });
  });

  // Interval graph coloring per gap
  // Returns {trackCount, trackOf: {key+type → trackIndex}}
  function colorGap(segs) {
    if (!segs.length) return { trackCount: 0, trackOf: {} };

    // Sort segments by ordering rule:
    // deps: left-going (chanX<x1) ascending chanX (farthest=smallest=top),
    //       right-going (chanX>=x1) descending chanX (farthest=largest=top)
    // arrs: right-coming (chanX>=x2) ascending chanX (closest=top),
    //       left-coming (chanX<x2) descending chanX (closest=top)
    // jogs: by chanX ascending (same rule as dep)
    // Place dep/jog group on top, arr group below.
    const deps = segs.filter(s => s.type==='dep'||s.type==='jog');
    const arrs = segs.filter(s => s.type==='arr');

    function sortDeps(segs) {
      const left  = segs.filter(s => s.chanX <  s.x1).sort((a,b) => a.chanX - b.chanX);
      const right = segs.filter(s => s.chanX >= s.x1).sort((a,b) => b.chanX - a.chanX);
      return [...left, ...right];
    }
    function sortArrs(segs) {
      const right = segs.filter(s => s.chanX >= s.x2).sort((a,b) => a.chanX - b.chanX);
      const left  = segs.filter(s => s.chanX <  s.x2).sort((a,b) => b.chanX - a.chanX);
      return [...right, ...left];
    }

    const orderedDeps = sortDeps(deps);
    const orderedArrs = sortArrs(arrs);
    const ordered = [...orderedDeps, ...orderedArrs];

    // Greedy interval coloring: assign each segment the lowest track
    // not occupied by any overlapping earlier segment.
    // Track 0 = top (lowest y), track N-1 = bottom.
    const trackOf = {};
    const trackEnd = []; // trackEnd[t] = xR of last segment assigned to track t

    ordered.forEach(s => {
      const segKey = s.key + ':' + s.type;
      // Find lowest track whose last segment ends before this one starts
      let t = 0;
      while (t < trackEnd.length && trackEnd[t] > s.xL + 1) t++;
      if (t === trackEnd.length) trackEnd.push(0);
      trackEnd[t] = s.xR;
      trackOf[segKey] = t;
    });

    // Separate dep tracks from arr tracks to enforce deps-above-arrs:
    // Find max dep track, shift arr tracks to start above it.
    const depTracks = orderedDeps.map(s => trackOf[s.key+':'+s.type]);
    const arrTracks = orderedArrs.map(s => trackOf[s.key+':'+s.type]);
    const maxDepTrack = depTracks.length ? Math.max(...depTracks) : -1;
    // Re-run coloring for arrs starting from maxDepTrack+1
    const arrTrackEnd = new Array(maxDepTrack + 1).fill(Infinity); // dep tracks are "full"
    orderedArrs.forEach(s => {
      const segKey = s.key + ':' + s.type;
      let t = maxDepTrack + 1;
      while (t < arrTrackEnd.length && arrTrackEnd[t] !== undefined && arrTrackEnd[t] > s.xL + 1) t++;
      if (t >= arrTrackEnd.length) {
        while (arrTrackEnd.length <= t) arrTrackEnd.push(0);
      }
      arrTrackEnd[t] = s.xR;
      trackOf[segKey] = t;
    });

    const allTracks = Object.values(trackOf);
    const trackCount = allTracks.length ? Math.max(...allTracks) + 1 : 0;
    return { trackCount, trackOf };
  }

  const gapColorings = {};
  for (let g = 0; g <= maxRank; g++) {
    gapColorings[g] = colorGap(gapSegs[g]);
  }

  // 8. Size gaps from track counts
  const gapHeights = [];
  for (let g = 0; g <= maxRank; g++) {
    const tc = gapColorings[g].trackCount;
    gapHeights.push(Math.max(RG_MIN, 2*STUB + Math.max(0, tc-1)*LANE_H + LANE_H));
  }

  // 9. Assign y positions from gap heights
  const rankY = [0];
  for (let r = 1; r <= maxRank; r++) rankY[r] = rankY[r-1] + NH + gapHeights[r-1];
  nodes.forEach(n => { pos[n.id].y = rankY[rank[n.id]]; });

  const vals = Object.values(pos);
  return { pos, rank, gapHeights, rankY, gapColorings, gapSegs, chanXMap,
           cw: Math.max(...vals.map(p => p.x)) + NW,
           ch: Math.max(...vals.map(p => p.y)) + NH };
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

// ── EDGE LAYOUT ─────────────────────────────────────────
// Converts track assignments into y offsets for edgePath.
function buildEdgeLayout(nodes, pos, rank, gapHeights, rankY, gapColorings, gapSegs, chanXMap) {
  const layouts = {};

  // Initialise all edges
  nodes.forEach(n => {
    n.prereqs.forEach(pid => {
      const sp = pos[pid], dp = pos[n.id];
      if (!sp || !dp) return;
      const x1 = sp.x + NW/2, x2 = dp.x + NW/2;
      const key = pid + '->' + n.id;
      const direct = Math.abs(x1 - x2) < 2;
      const chanX = direct ? x1 : chanXMap[key];
      layouts[key] = { direct: direct || !isFinite(chanX), chanX: chanX || x1, yDepartOff: 0, yArriveOff: 0 };
    });
  });

  // Convert track index → y position within gap
  // Track 0 = top = lowest y = gapTop + STUB
  // Track N-1 = bottom = highest y = gapTop + gapH - STUB
  function trackY(g, trackIdx, trackCount) {
    const gapTop = rankY[g] + NH;
    const gapBot = rankY[g] + NH + gapHeights[g];
    const usable = gapBot - gapTop - 2*STUB; // space between stubs
    if (trackCount <= 1) return gapTop + STUB + usable/2;
    return gapTop + STUB + trackIdx * (usable / (trackCount - 1));
  }

  for (let g = 0; g <= Math.max(...nodes.map(n => rank[n.id])); g++) {
    const { trackCount, trackOf } = gapColorings[g];
    const segs = gapSegs[g];
    segs.forEach(s => {
      const segKey = s.key + ':' + s.type;
      const t = trackOf[segKey];
      if (t === undefined) return;
      const y = trackY(g, t, trackCount);
      const info = layouts[s.key];
      if (!info) return;
      if (s.type === 'dep' || s.type === 'jog') {
        const baseY = pos[s.srcId].y + NH + STUB;
        info.yDepartOff = y - baseY;
      } else {
        const baseY = pos[s.dstId].y - STUB;
        info.yArriveOff = y - baseY;
      }
    });
  }

  return layouts;
}


// ── EDGE PATH ───────────────────────────────────────────
// Converts edge layout info into an SVG path string.
// Three cases:
//   1. Same column (direct): straight vertical line
//   2. Adjacent rows, different column: 3 segments (down | horiz | up)
//   3. Non-adjacent rows, different column: 5 segments
function edgePath(pos, rank, cw, srcId, dstId, nodeList, edgeLayouts) {
  const sp = pos[srcId], dp = pos[dstId];
  const x1 = sp.x + NW/2, y1 = sp.y + NH;
  const x2 = dp.x + NW/2, y2 = dp.y;
  const srcR = rank[srcId], dstR = rank[dstId];
  const adjacent = (dstR - srcR) === 1;
  const info = edgeLayouts[srcId + '->' + dstId] || { direct: true };

  if (info.direct || Math.abs(x1 - x2) < 2) {
    return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
  }

  const chanX = info.chanX;
  const sx1 = Math.sign(chanX - x1) || 1;
  const sx2 = Math.sign(x2 - chanX) || 1;
  const s = [];

  function cap2(r, len) { return Math.max(0, Math.min(r, (Math.abs(len) - 1) / 2)); }
  function cap1(r, len) { return Math.max(0, Math.min(r, Math.abs(len) - 1)); }

  if (adjacent) {
    const yMid = y1 + STUB + (info.yDepartOff || 0);
    const v1 = yMid - y1, h = x2 - x1, v2 = y2 - yMid;
    const r1 = Math.min(cap1(RC, v1), cap2(RC, h));
    const r2 = Math.min(cap2(RC, h), cap1(RC, v2));
    const safe1 = Math.max(0, r1), safe2 = Math.max(0, r2);
    s.push('M' + x1 + ',' + y1);
    s.push('L' + x1 + ',' + (yMid - safe1));
    s.push('Q' + x1 + ',' + yMid + ' ' + (x1 + sx1*safe1) + ',' + yMid);
    s.push('L' + (x2 - sx2*safe2) + ',' + yMid);
    s.push('Q' + x2 + ',' + yMid + ' ' + x2 + ',' + (yMid + safe2));
    s.push('L' + x2 + ',' + y2);
    return s.join(' ');
  }

  const yDepart = y1 + STUB + (info.yDepartOff || 0);
  const yArrive = y2 - STUB + (info.yArriveOff || 0);
  const v1 = yDepart - y1, h1 = chanX - x1, v2 = yArrive - yDepart, h2 = x2 - chanX, v3 = y2 - yArrive;
  const r1 = Math.min(cap1(RC, v1), cap2(RC, h1));
  const r2 = Math.min(cap2(RC, h1), cap2(RC, v2));
  const r3 = Math.min(cap2(RC, v2), cap2(RC, h2));
  const r4 = Math.min(cap2(RC, h2), cap1(RC, v3));

  s.push('M' + x1 + ',' + y1);
  s.push('L' + x1 + ',' + (yDepart - r1));
  s.push('Q' + x1 + ',' + yDepart + ' ' + (x1 + sx1*r1) + ',' + yDepart);
  s.push('L' + (chanX - sx1*r2) + ',' + yDepart);
  s.push('Q' + chanX + ',' + yDepart + ' ' + chanX + ',' + (yDepart + r2));
  s.push('L' + chanX + ',' + (yArrive - r3));
  s.push('Q' + chanX + ',' + yArrive + ' ' + (chanX + sx2*r3) + ',' + yArrive);
  s.push('L' + (x2 - sx2*r4) + ',' + yArrive);
  s.push('Q' + x2 + ',' + yArrive + ' ' + x2 + ',' + (yArrive + r4));
  s.push('L' + x2 + ',' + y2);
  return s.join(' ');
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

  // All other trees: standard vertical layout
  function makeVertBlock(tree){
    const block=document.createElement('div');block.className='tree-block';
    const{t,d}=tprog(tree);
    block.innerHTML=`<div class="t-hdr"><div class="t-icon">${tree.icon}</div><div><div class="t-name">${tree.name}</div><div class="t-sub">${tree.subtitle}</div></div><div class="t-pill"><span class="d">${d}</span> / ${t}</div></div>`;
    const{pos,rank,cw,ch,gapHeights,rankY,gapColorings,gapSegs,chanXMap}=layout(tree.nodes);
    block.style.width=cw+'px';
    const edgeLayouts=buildEdgeLayout(tree.nodes,pos,rank,gapHeights,rankY,gapColorings,gapSegs,chanXMap);
    const wrap=document.createElement('div');wrap.className='canvas-wrap';wrap.style.width=cw+'px';wrap.style.height=(ch+16)+'px';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width',cw);svg.setAttribute('height',ch+16);svg.classList.add('tree-svg');
    tree.nodes.forEach(node=>{
      const tp=pos[node.id];if(!tp)return;
      node.prereqs.forEach(pid=>{
        const fp=pos[pid];if(!fp)return;
        const fn=tree.nodes.find(n=>n.id===pid);
        const fds=dsp(fn,tree);
        const d=edgePath(pos,rank,cw,pid,node.id,tree.nodes,edgeLayouts);
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
function openPanel(node,tree){
  selNode=node;selTree=tree;
  const ds=dsp(node,tree),raw=gst(node.id);
  document.getElementById('pTag').textContent=tree.icon+'  '+tree.name.toUpperCase();
  document.getElementById('pTitle').textContent=node.label;
  document.getElementById('pDesc').textContent=node.desc;
  const badge=document.getElementById('pBadge');badge.className='sbadge '+ds;
  document.getElementById('pSt').textContent={locked:'Locked',available:'Available','in-progress':'In Progress',complete:'Complete'}[ds];
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
  go, onTreeSel, closePanel, setSt, doLogin, doLogout, mnAdd, mnRemove,
});
