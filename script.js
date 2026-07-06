const ALGORITHMS = [
  { key: 'fcfs', label: 'FCFS', category: 'NPP' },
  { key: 'sjf', label: 'SJF', category: 'NPP' },
  { key: 'priority_npp', label: 'Priority', category: 'NPP' },
  { key: 'srtf', label: 'SRTF', category: 'PP' },
  { key: 'rr', label: 'Round Robin', category: 'PP' },
  { key: 'priority_pp', label: 'Priority', category: 'PP' },
];

const COLORS = [
  '#7ec7ff',
  '#9df0b7',
  '#ffb27e',
  '#d3b8ff',
  '#ffd873',
  '#ffc7e4',
  '#8ce5e0',
  '#c6a9ff',
];

let state = {
  processes: [
    { arrival: 0, burst: 5, priority: 2 },
    { arrival: 1, burst: 3, priority: 1 },
    { arrival: 2, burst: 8, priority: 3 },
  ],
  algorithm: 'fcfs',
  speed: 'fast',
};

// simulation
const SPEED_SETTINGS = {
  slow: { msPerUnit: 220, min: 1200, max: 9000 },
  fast: { msPerUnit: 70, min: 500, max: 4000 },
};

const playback = {
  rafId: null,
  segments: null,
  elements: null,
  span: 0,
  events: null,
  table: null,
};

// scheduler
function renumberProcesses() {
  state.processes.forEach((p, i) => {
    p.pid = `P${i + 1}`;
  });
}

function renderProcessRows() {
  renumberProcesses();
  const body = document.getElementById('processRows');
  body.innerHTML = '';
  state.processes.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pid-chip">${p.pid}</span></td>
      <td><input type="number" min="0" value="${p.arrival}" data-field="arrival" data-idx="${idx}"></td>
      <td><input type="number" min="1" value="${p.burst}" data-field="burst" data-idx="${idx}"></td>
      <td><input type="number" min="1" value="${p.priority}" data-field="priority" data-idx="${idx}"></td>
      <td><button class="row-remove" data-idx="${idx}" title="Remove">✕</button></td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = +e.target.dataset.idx;
      const field = e.target.dataset.field;
      state.processes[idx][field] = Math.max(
        field === 'arrival' ? 0 : 1,
        parseInt(e.target.value, 10) || 0
      );
      e.target.value = state.processes[idx][field];
    });
  });
  body.querySelectorAll('.row-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.processes.splice(+e.target.dataset.idx, 1);
      renderProcessRows();
    });
  });
}

function addProcess() {
  state.processes.push({ arrival: 0, burst: 1, priority: state.processes.length + 1 });
  renderProcessRows();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

//process list
function randomizeProcesses() {
  const countInput = document.getElementById('randomCountInput');
  let count = parseInt(countInput?.value, 10) || 4;
  count = Math.max(1, Math.min(12, count));
  if (countInput) countInput.value = count;

  const maxArrival = Math.max(4, count * 2);
  state.processes = Array.from({ length: count }, () => ({
    arrival: randInt(0, maxArrival),
    burst: randInt(1, 9),
    priority: randInt(1, 5),
  }));

  renderProcessRows();
  renderQueueMonitor(0, [], []);
  showToast(`Randomized ${count} process${count > 1 ? 'es' : ''}.`);
}

function renderPills() {
  const npp = document.getElementById('pillsNPP');
  const pp = document.getElementById('pillsPP');
  npp.innerHTML = '';
  pp.innerHTML = '';

  ALGORITHMS.forEach((a) => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (a.key === state.algorithm ? ' active' : '');
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      state.algorithm = a.key;
      renderPills();
      document.getElementById('quantumRow').classList.toggle('hidden', a.key !== 'rr');
    });
    (a.category === 'NPP' ? npp : pp).appendChild(btn);
  });
  document.getElementById('quantumRow').classList.toggle('hidden', state.algorithm !== 'rr');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function pidColor(pid, palette) {
  if (!palette.has(pid)) palette.set(pid, COLORS[palette.size % COLORS.length]);
  return palette.get(pid);
}

function addTimelineMarker(timeline, value, pixelPosition) {
  const marker = document.createElement('div');
  marker.className = 'timeline-label';
  marker.textContent = `${value}`;
  marker.style.left = `${pixelPosition}px`;
  if (pixelPosition === 0) {
    marker.style.transform = 'none';
    marker.style.left = '0';
  } else {
    marker.style.transform = 'translateX(-50%)';
  }
  timeline.appendChild(marker);
}

function alignTimeline() {
  const bars = document.querySelectorAll('.process-bar');
  const timeline = document.getElementById('timeline-container');
  if (!timeline || !bars.length) return;

  timeline.innerHTML = '';
  let cumulativeTime = 0;

  addTimelineMarker(timeline, 0, 0);

  bars.forEach((bar) => {
    const duration = parseInt(bar.dataset.burst || bar.dataset.duration || '0', 10) || 0;
    cumulativeTime += duration;

    const position = bar.offsetLeft + bar.offsetWidth;
    addTimelineMarker(timeline, cumulativeTime, position);
  });
}

function renderTimelineLabels() {
  requestAnimationFrame(() => alignTimeline());
}

function setSimProgress(fraction, simTime, span) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  document.getElementById('simProgressFill').style.width = pct + '%';
  document.getElementById('simProgressMarker').style.left = pct + '%';
  document.getElementById('simProgressTime').textContent = `t = ${Math.round(simTime)} / ${span}ms`;
}

function paintGanttAtTime(simTime) {
  playback.elements.forEach(({ el, start, end }) => {
    if (simTime <= start) {
      el.style.clipPath = 'inset(0 100% 0 0)';
    } else if (simTime >= end) {
      el.style.clipPath = 'inset(0 0% 0 0)';
    } else {
      const frac = (simTime - start) / (end - start);
      el.style.clipPath = `inset(0 ${(1 - frac) * 100}% 0 0)`;
    }
  });
}

function stopPlayback() {
  if (playback.rafId !== null) {
    cancelAnimationFrame(playback.rafId);
    playback.rafId = null;
  }
}

function parseEventTime(line) {
  const match = String(line || '').match(/t=(\d+)/);
  return match ? Number(match[1]) : 0;
}

function renderLogAtTime(simTime, events) {
  const box = document.getElementById('logBox');
  if (!box) return;

  box.innerHTML = '';
  if (!events || !events.length) {
    box.innerHTML = '<span class="empty-note">No events yet.</span>';
    return;
  }

  const visible = events.filter((line) => parseEventTime(line) <= simTime);
  if (!visible.length) {
    box.innerHTML = '<span class="empty-note">Waiting for first event…</span>';
    return;
  }

  visible.forEach((line) => {
    const div = document.createElement('div');
    div.innerHTML = `<span>&rsaquo;</span>${line}`;
    box.appendChild(div);
  });
  box.scrollTop = 0;
}

function renderQueueMonitor(simTime, segments = [], table = []) {
  const readyBox = document.getElementById('monitorReady');
  const runningBox = document.getElementById('monitorRunning');
  const completedBox = document.getElementById('monitorCompleted');
  const runningDot = document.querySelector('#monitorRunningCol .dot-running');
  if (!readyBox || !runningBox || !completedBox) return;

  if (!table || !table.length) {
    readyBox.innerHTML = '<span class="empty-note">empty</span>';
    runningBox.innerHTML = '<span class="empty-note">idle</span>';
    completedBox.innerHTML = '<span class="empty-note">not yet</span>';
    runningDot?.classList.remove('pulse');
    return;
  }

  const runningSeg = segments.find(
    (seg) => seg.pid !== 'IDLE' && simTime >= seg.start && simTime < seg.end
  );
  const runningPid = runningSeg ? runningSeg.pid : null;

  const completed = [];
  const ready = [];
  table.forEach((r) => {
    if (r.arrival > simTime) return; // hasn't arrived in the system yet
    if (r.end <= simTime) {
      completed.push(r);
    } else if (r.pid !== runningPid) {
      ready.push(r);
    }
  });
  ready.sort((a, b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
  completed.sort((a, b) => a.end - b.end);

  readyBox.innerHTML = ready.length
    ? ready
        .map(
          (r) =>
            `<span class="monitor-chip">${r.pid}<span class="chip-sub">AT ${r.arrival}</span></span>`
        )
        .join('')
    : '<span class="empty-note">empty</span>';

  if (runningPid) {
    runningBox.innerHTML = `<span class="monitor-chip running">${runningPid}<span class="chip-sub">t=${Math.round(simTime)}</span></span>`;
    runningDot?.classList.add('pulse');
  } else {
    runningBox.innerHTML = '<span class="empty-note">idle</span>';
    runningDot?.classList.remove('pulse');
  }

  completedBox.innerHTML = completed.length
    ? completed
        .map(
          (r) =>
            `<span class="monitor-chip completed">${r.pid}<span class="chip-sub">ET ${r.end}</span></span>`
        )
        .join('')
    : '<span class="empty-note">not yet</span>';
}

function startPlayback(segments, elements, span, events = [], table = []) {
  stopPlayback();
  playback.segments = segments;
  playback.elements = elements;
  playback.span = span;
  playback.events = events;
  playback.table = table;

  const axis = document.getElementById('timeline-container');
  if (axis) axis.style.opacity = '0';

  if (!span) {
    setSimProgress(1, 0, 0);
    paintGanttAtTime(0);
    renderLogAtTime(0, events);
    renderResults(table);
    renderQueueMonitor(0, segments, table);
    if (axis) axis.style.opacity = '1';
    return;
  }

  renderLogAtTime(0, events);
  renderResults([]);
  renderQueueMonitor(0, segments, table);

  const timing = SPEED_SETTINGS[state.speed] || SPEED_SETTINGS.fast;
  const totalDuration = Math.min(Math.max(span * timing.msPerUnit, timing.min), timing.max);
  const startedAt = performance.now();

  function frame(now) {
    const elapsed = now - startedAt;
    const progress = Math.min(elapsed / totalDuration, 1);
    const simTime = progress * span;

    setSimProgress(progress, simTime, span);
    paintGanttAtTime(simTime);
    renderLogAtTime(simTime, events);
    renderQueueMonitor(simTime, segments, table);

    if (progress < 1) {
      playback.rafId = requestAnimationFrame(frame);
    } else {
      playback.rafId = null;
      renderLogAtTime(span, events);
      renderResults(table);
      renderQueueMonitor(span, segments, table);
      renderTimelineLabels();
      if (axis) {
        axis.style.transition = 'opacity 0.25s ease';
        axis.style.opacity = '1';
      }
    }
  }

  playback.rafId = requestAnimationFrame(frame);
}

function renderGantt(segments, events = [], table = []) {
  stopPlayback();
  const track = document.getElementById('ganttTrack');
  const legend = document.getElementById('ganttLegend');
  if (!track || !legend) return;

  const existingAxis = track.parentElement?.querySelector('.timeline-axis');
  if (existingAxis) existingAxis.remove();

  track.innerHTML = '';
  legend.innerHTML = '';

  if (!segments || !segments.length) {
    track.innerHTML = '<span class="empty-note">Run a simulation to see the CPU timeline.</span>';
    setSimProgress(0, 0, 0);
    renderQueueMonitor(0, [], []);
    return;
  }

  const palette = new Map();
  const axis = document.createElement('div');
  axis.className = 'timeline-axis';
  axis.id = 'timeline-container';
  track.insertAdjacentElement('afterend', axis);

  const elements = [];
  segments.forEach((seg) => {
    const dur = seg.end - seg.start;
    const div = document.createElement('div');
    div.className = 'gseg process-bar' + (seg.pid === 'IDLE' ? ' idle' : '');
    div.dataset.burst = dur;
    div.style.flexGrow = dur;
    div.style.flexBasis = '0';
    div.style.background = seg.pid === 'IDLE' ? '' : pidColor(seg.pid, palette);

    if (seg.pid !== 'IDLE') {
      div.innerHTML = `<span class="gseg-pid">${seg.pid}</span>`;
    } else {
      div.innerHTML = '<span class="gseg-dur">idle</span>';
    }
    track.appendChild(div);
    elements.push({ el: div, start: seg.start, end: seg.end });
  });

  const span = segments.reduce((max, seg) => Math.max(max, seg.end), 0);
  startPlayback(segments, elements, span, events, table);

  // Legend: one swatch per pid, with its total burst duration on the CPU.
  const totals = new Map();
  segments.forEach((seg) => {
    if (seg.pid === 'IDLE') return;
    totals.set(seg.pid, (totals.get(seg.pid) || 0) + (seg.end - seg.start));
  });
  totals.forEach((total, pid) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch" style="background:${palette.get(pid)}"></span>${pid} · ${total}ms`;
    legend.appendChild(item);
  });
}

function renderLog(events) {
  const box = document.getElementById('logBox');
  box.innerHTML = '';
  if (!events || !events.length) {
    box.innerHTML = `<span class="empty-note">No events yet.</span>`;
    return;
  }
  events.forEach((line) => {
    const div = document.createElement('div');
    div.innerHTML = `<span>&rsaquo;</span>${line}`;
    box.appendChild(div);
  });
  box.scrollTop = 0;
}

function renderResults(table) {
  const body = document.getElementById('resultRows');
  body.innerHTML = '';
  if (!table || !table.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-note">No results yet.</td></tr>`;
    return;
  }
  table.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.pid}</td><td>${r.arrival}</td><td>${r.burst}</td><td>${r.priority}</td>
      <td>${r.start}</td><td>${r.end}</td><td>${r.waiting}</td><td>${r.turnaround}</td>
    `;
    body.appendChild(tr);
  });
}

async function runSimulation() {
  if (!state.processes.length) {
    showToast('Add at least one process first.');
    return;
  }
  const payload = {
    processes: state.processes,
    algorithm: state.algorithm,
    quantum: parseInt(document.getElementById('quantumInput').value, 10) || 2,
  };

  const origin = window.location.origin;
  const apiUrl = origin && origin !== 'null' ? `${origin}/api/simulate` : '/api/simulate';

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = { error: 'The server returned an invalid response.' };
    }

    if (!res.ok) {
      showToast(data.error || 'The server rejected the simulation request.');
      return;
    }

    renderGantt(data.segments, data.events, data.table);
    document.getElementById('statUtil').innerHTML =
      data.cpu_utilization.toFixed(2) + '<span class="unit">%</span>';
    document.getElementById('statAwt').innerHTML =
      data.avg_waiting.toFixed(2) + '<span class="unit">ms</span>';
    document.getElementById('statAtat').innerHTML =
      data.avg_turnaround.toFixed(2) + '<span class="unit">ms</span>';

    const label = ALGORITHMS.find((a) => a.key === state.algorithm)?.label || state.algorithm;
    showToast(
      `${label} complete — ${state.processes.length} process${state.processes.length > 1 ? 'es' : ''} scheduled.`
    );
  } catch (err) {
    console.error(err);
    showToast('Could not reach the server. Make sure server.py is running on port 8000.');
  }
}

function tickClock() {
  document.getElementById('liveClock').textContent = new Date().toLocaleTimeString();
}

document.getElementById('addProcessBtn').addEventListener('click', addProcess);
document.getElementById('randomizeBtn').addEventListener('click', randomizeProcesses);
document.getElementById('runBtn').addEventListener('click', runSimulation);

//SPEED CONTROL — Slow / Fast toggle for the Gantt playback
const speedButtons = [
  document.getElementById('speedSlowBtn'),
  document.getElementById('speedFastBtn'),
];
speedButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.speed = btn.dataset.speed;
    speedButtons.forEach((b) => b.classList.toggle('active', b === btn));
  });
});

//ICON DOCK DRAWERS — Process Queue / Algorithm
const overlay = document.getElementById('drawerOverlay');
const dockButtons = [
  {
    btn: document.getElementById('dockProcessBtn'),
    drawer: document.getElementById('drawerProcess'),
    close: document.getElementById('closeProcessBtn'),
  },
  {
    btn: document.getElementById('dockAlgoBtn'),
    drawer: document.getElementById('drawerAlgo'),
    close: document.getElementById('closeAlgoBtn'),
  },
];

function closeAllDrawers() {
  dockButtons.forEach(({ btn, drawer }) => {
    drawer.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  });
  overlay.classList.remove('open');
}

function openDrawer(target) {
  const isAlreadyOpen = target.drawer.classList.contains('open');
  closeAllDrawers();
  if (!isAlreadyOpen) {
    target.drawer.classList.add('open');
    target.btn.classList.add('active');
    target.btn.setAttribute('aria-expanded', 'true');
    overlay.classList.add('open');
  }
}

dockButtons.forEach((entry) => {
  entry.btn.addEventListener('click', () => openDrawer(entry));
  entry.close.addEventListener('click', closeAllDrawers);
});
overlay.addEventListener('click', closeAllDrawers);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllDrawers();
});

renderProcessRows();
renderPills();
renderQueueMonitor(0, [], []);
tickClock();
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => alignTimeline(), 120);
});
setInterval(tickClock, 1000);
