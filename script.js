/* Dupla Pomodoro • Ludmila & Priscila
   - Presets estilo Pomofocus: 25/5/15, pausa longa a cada 4 pomodoros
   - Auto-migração com som, notificações, vibração, persistência
   - Background particles
*/

(() => {
    // ---------- Helpers ----------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  
    const pad2 = (n) => String(n).padStart(2, "0");
    const fmtTime = (sec) => `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
  
    const STORAGE_KEY = "dupla_pomodoro_v1";
  
    // ---------- State ----------
    const state = {
      mode: "pomodoro", // pomodoro | short | long
      isRunning: false,
      remainingSec: 25 * 60,
      totalSec: 25 * 60,
      intervalId: null,
      pomoCount: 0,
  
      settings: {
        pomoMin: 25,
        shortMin: 5,
        longMin: 15,
        longEvery: 4,
        autoBreak: true,
        autoFocus: false,
        sound: "chime",
        volume: 0.7,
        focusTitle: "",
        duoSync: true
      },
  
      goals: {
        lud: { name: "Ludmila", items: [] }, // items: {id, text, done}
        pri: { name: "Priscila", items: [] }
      }
    };
  
    // ---------- Elements ----------
    const el = {
      timeDisplay: $("#timeDisplay"),
      timeHint: $("#timeHint"),
      sessionLabel: $("#sessionLabel"),
      stateLabel: $("#stateLabel"),
      nextLabel: $("#nextLabel"),
      pomoCount: $("#pomoCount"),
  
      ringProgress: document.querySelector(".ring-progress"),
  
      btnStart: $("#btnStart"),
      btnPause: $("#btnPause"),
      btnSkip: $("#btnSkip"),
      btnReset: $("#btnReset"),
      btnResetAll: $("#btnResetAll"),
  
      btnRequestNotif: $("#btnRequestNotif"),
      btnSoundTest: $("#btnSoundTest"),
  
      modes: $$(".mode"),
  
      inpPomo: $("#inpPomo"),
      inpShort: $("#inpShort"),
      inpLong: $("#inpLong"),
      inpLongEvery: $("#inpLongEvery"),
      togAutoBreak: $("#togAutoBreak"),
      togAutoFocus: $("#togAutoFocus"),
      selSound: $("#selSound"),
      rngVol: $("#rngVol"),
      inpFocusTitle: $("#inpFocusTitle"),
  
      // Goals
      badgeSync: $("#badgeSync"),
      btnToggleSync: $("#btnToggleSync"),
  
      nameLud: $("#nameLud"),
      namePri: $("#namePri"),
  
      formAddLud: $("#formAddLud"),
      formAddPri: $("#formAddPri"),
      inpAddLud: $("#inpAddLud"),
      inpAddPri: $("#inpAddPri"),
      listLud: $("#listLud"),
      listPri: $("#listPri"),
  
      doneLud: $("#doneLud"),
      totalLud: $("#totalLud"),
      donePri: $("#donePri"),
      totalPri: $("#totalPri"),
  
      btnClearLud: $("#btnClearLud"),
      btnWipeLud: $("#btnWipeLud"),
      btnClearPri: $("#btnClearPri"),
      btnWipePri: $("#btnWipePri"),
    };
  
    // ---------- Audio (WebAudio synth) ----------
    let audioCtx = null;
  
    function ensureAudio() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    }
  
    function playTone({ freq = 440, type = "sine", duration = 0.25, gain = 0.08, when = 0 }) {
      const ctx = ensureAudio();
      const t0 = ctx.currentTime + when;
  
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  
      osc.connect(g);
      g.connect(ctx.destination);
  
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }
  
    function soundPreset(name, vol = 0.7) {
      const base = clamp(vol, 0, 1);
  
      // Pequenos “motivos” musicais para cada som
      if (name === "chime") {
        playTone({ freq: 784, type: "sine", duration: 0.18, gain: 0.08 * base, when: 0 });
        playTone({ freq: 988, type: "sine", duration: 0.22, gain: 0.07 * base, when: 0.10 });
        playTone({ freq: 1175, type: "sine", duration: 0.30, gain: 0.06 * base, when: 0.22 });
        return;
      }
  
      if (name === "bell") {
        playTone({ freq: 659, type: "triangle", duration: 0.25, gain: 0.09 * base, when: 0 });
        playTone({ freq: 1318, type: "triangle", duration: 0.18, gain: 0.06 * base, when: 0.04 });
        playTone({ freq: 1976, type: "triangle", duration: 0.14, gain: 0.05 * base, when: 0.08 });
        return;
      }
  
      if (name === "beep") {
        playTone({ freq: 880, type: "square", duration: 0.12, gain: 0.05 * base, when: 0 });
        playTone({ freq: 880, type: "square", duration: 0.12, gain: 0.05 * base, when: 0.18 });
        playTone({ freq: 1047, type: "square", duration: 0.14, gain: 0.05 * base, when: 0.36 });
        return;
      }
  
      // gong
      playTone({ freq: 220, type: "sine", duration: 0.50, gain: 0.08 * base, when: 0 });
      playTone({ freq: 329, type: "sine", duration: 0.35, gain: 0.05 * base, when: 0.08 });
      playTone({ freq: 440, type: "sine", duration: 0.28, gain: 0.04 * base, when: 0.16 });
    }
  
    function playTransitionSound(kind) {
      // kind: "end" | "switch"
      const vol = state.settings.volume;
      if (kind === "switch") {
        // “passinho” curto pra marcar troca
        playTone({ freq: 523, type: "sine", duration: 0.08, gain: 0.05 * vol, when: 0 });
        playTone({ freq: 659, type: "sine", duration: 0.10, gain: 0.05 * vol, when: 0.08 });
        return;
      }
      soundPreset(state.settings.sound, vol);
    }
  
    // ---------- Notifications ----------
    async function requestNotifications() {
      try {
        if (!("Notification" in window)) return false;
        const res = await Notification.requestPermission();
        return res === "granted";
      } catch {
        return false;
      }
    }
  
    function notify(title, body) {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, { body });
      } catch {
        // some browsers block without user gesture
      }
    }
  
    // ---------- Persistence ----------
    function save() {
      const payload = JSON.stringify({
        mode: state.mode,
        isRunning: state.isRunning,
        remainingSec: state.remainingSec,
        totalSec: state.totalSec,
        pomoCount: state.pomoCount,
        settings: state.settings,
        goals: state.goals
      });
      localStorage.setItem(STORAGE_KEY, payload);
    }
  
    function load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        state.mode = data.mode ?? state.mode;
        state.isRunning = false; // sempre recomeça pausado por segurança
        state.remainingSec = data.remainingSec ?? state.remainingSec;
        state.totalSec = data.totalSec ?? state.totalSec;
        state.pomoCount = data.pomoCount ?? state.pomoCount;
        state.settings = { ...state.settings, ...(data.settings || {}) };
        state.goals = { ...state.goals, ...(data.goals || {}) };
      } catch {
        // ignore
      }
    }
  
    // ---------- Timer Logic ----------
    function getModeSeconds(mode) {
      const s = state.settings;
      if (mode === "pomodoro") return s.pomoMin * 60;
      if (mode === "short") return s.shortMin * 60;
      return s.longMin * 60;
    }
  
    function modeLabel(mode) {
      if (mode === "pomodoro") return "Foco";
      if (mode === "short") return "Pausa Curta";
      return "Pausa Longa";
    }
  
    function hintFor(mode) {
      const title = (state.settings.focusTitle || "").trim();
      const duo = state.settings.duoSync ? " (dupla)" : "";
      if (mode === "pomodoro") {
        return title
          ? `Foco: ${title}${duo}. Uma coisa de cada vez.`
          : "Respira. Entra no foco com leveza.";
      }
      if (mode === "short") return "Pausa curta: água, alonga, volta com carinho.";
      return "Pausa longa: descanso real. O cérebro agradece.";
    }
  
    function computeNextMode(currentMode) {
      if (currentMode === "pomodoro") {
        const nextPomo = state.pomoCount + 1; // vai virar mais um ao finalizar
        const every = clamp(state.settings.longEvery, 2, 12);
        if (nextPomo % every === 0) return "long";
        return "short";
      }
      // se estiver em pausa, volta pro foco
      return "pomodoro";
    }
  
    function updateNextLabel() {
      const next = computeNextMode(state.mode);
      el.nextLabel.textContent = `${modeLabel(next)} (${fmtTime(getModeSeconds(next))})`;
    }
  
    function setRingProgress() {
      // círculo com r=52 => circunferência ~ 2*pi*52 = 326.7 (usamos 327 no CSS)
      const C = 327;
      const ratio = state.totalSec ? state.remainingSec / state.totalSec : 0;
      const offset = C * (1 - clamp(ratio, 0, 1));
      el.ringProgress.style.strokeDashoffset = String(offset);
  
      // muda cor sutilmente por modo
      if (state.mode === "pomodoro") el.ringProgress.style.stroke = "rgba(124,243,208,0.95)";
      if (state.mode === "short") el.ringProgress.style.stroke = "rgba(255,210,124,0.95)";
      if (state.mode === "long") el.ringProgress.style.stroke = "rgba(255,123,214,0.92)";
    }
  
    function setDocTitle() {
      const t = fmtTime(state.remainingSec);
      const label = modeLabel(state.mode);
      document.title = `${t} • ${label} • Dupla Pomodoro`;
    }
  
    function renderTimer() {
      el.timeDisplay.textContent = fmtTime(state.remainingSec);
      el.sessionLabel.textContent = `Sessão: ${modeLabel(state.mode)}`;
      el.timeHint.textContent = hintFor(state.mode);
      el.pomoCount.textContent = String(state.pomoCount);
  
      setRingProgress();
      setDocTitle();
  
      // buttons
      el.btnStart.disabled = state.isRunning;
      el.btnPause.disabled = !state.isRunning;
  
      el.stateLabel.textContent = state.isRunning ? "Rodando com presença" : "Pronta pra começar";
  
      updateNextLabel();
    }
  
    function applyMode(mode, { reset = true, playSwitch = true } = {}) {
      state.mode = mode;
  
      // UI tabs
      el.modes.forEach((b) => {
        const active = b.dataset.mode === mode;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
  
      if (reset) {
        state.totalSec = getModeSeconds(mode);
        state.remainingSec = state.totalSec;
      }
  
      if (playSwitch) playTransitionSound("switch");
      stopTimer(false);
      renderTimer();
      save();
    }
  
    function startTimer() {
      if (state.isRunning) return;
  
      ensureAudio(); // garante contexto de áudio (precisa de gesto do usuário)
      state.isRunning = true;
  
      const tick = () => {
        state.remainingSec -= 1;
  
        if (state.remainingSec <= 0) {
          state.remainingSec = 0;
          renderTimer();
          onFinish();
          return;
        }
        renderTimer();
        save();
      };
  
      renderTimer();
      state.intervalId = window.setInterval(tick, 1000);
      save();
    }
  
    function stopTimer(saveNow = true) {
      state.isRunning = false;
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
      }
      if (saveNow) save();
    }
  
    function resetTimerOnly() {
      stopTimer();
      state.totalSec = getModeSeconds(state.mode);
      state.remainingSec = state.totalSec;
      renderTimer();
      save();
    }
  
    function resetAll() {
      stopTimer();
      state.pomoCount = 0;
      applyMode("pomodoro", { reset: true, playSwitch: false });
      state.settings.focusTitle = "";
      el.inpFocusTitle.value = "";
      save();
    }
  
    function vibrate(pattern = [120, 80, 120]) {
      try {
        if ("vibrate" in navigator) navigator.vibrate(pattern);
      } catch {}
    }
  
    function onFinish() {
      stopTimer();
  
      // atualiza contagem de pomodoro quando finaliza foco
      if (state.mode === "pomodoro") {
        state.pomoCount += 1;
      }
  
      // sons + notificação
      playTransitionSound("end");
      vibrate();
  
      const focusTitle = (state.settings.focusTitle || "").trim();
      const title = state.mode === "pomodoro" ? "Foco concluído 🍅" : "Pausa concluída 🌿";
      const body = focusTitle
        ? `${modeLabel(state.mode)} terminou — ${focusTitle}`
        : `${modeLabel(state.mode)} terminou.`;
  
      notify(title, body);
  
      // migração para próxima sessão
      const next = computeNextMode(state.mode);
      applyMode(next, { reset: true, playSwitch: true });
  
      // auto-start
      const shouldAutoStart =
        (state.mode === "pomodoro" && state.settings.autoFocus) ||
        (state.mode !== "pomodoro" && state.settings.autoBreak);
  
      if (shouldAutoStart) {
        // pequeno respiro
        setTimeout(() => startTimer(), 450);
      }
  
      save();
    }
  
    function skipSession() {
      stopTimer();
      // se pular foco, não incrementa pomodoro (igual pomofocus)
      const next = computeNextMode(state.mode);
      applyMode(next, { reset: true, playSwitch: true });
  
      // auto-start conforme toggles
      const shouldAutoStart =
        (state.mode === "pomodoro" && state.settings.autoFocus) ||
        (state.mode !== "pomodoro" && state.settings.autoBreak);
  
      if (shouldAutoStart) setTimeout(() => startTimer(), 250);
      save();
    }
  
    // ---------- Settings Bind ----------
    function applySettingsToInputs() {
      const s = state.settings;
      el.inpPomo.value = s.pomoMin;
      el.inpShort.value = s.shortMin;
      el.inpLong.value = s.longMin;
      el.inpLongEvery.value = s.longEvery;
      el.togAutoBreak.checked = !!s.autoBreak;
      el.togAutoFocus.checked = !!s.autoFocus;
      el.selSound.value = s.sound;
      el.rngVol.value = Math.round(s.volume * 100);
      el.inpFocusTitle.value = s.focusTitle || "";
      el.badgeSync.textContent = s.duoSync ? "🤝 Sincronia: ON" : "🧩 Sincronia: OFF";
  
      el.nameLud.value = state.goals.lud.name || "Ludmila";
      el.namePri.value = state.goals.pri.name || "Priscila";
    }
  
    function onSettingsChanged({ resetCurrentMode = true } = {}) {
      // atualiza total/remaining ao mexer no preset do modo atual (como Pomofocus)
      if (resetCurrentMode) {
        state.totalSec = getModeSeconds(state.mode);
        state.remainingSec = state.totalSec;
        stopTimer();
      }
      renderTimer();
      save();
    }
  
    function bindSettings() {
      const num = (v, min, max, fallback) => {
        const n = Number(v);
        if (Number.isFinite(n)) return clamp(Math.round(n), min, max);
        return fallback;
      };
  
      el.inpPomo.addEventListener("change", () => {
        state.settings.pomoMin = num(el.inpPomo.value, 1, 180, 25);
        onSettingsChanged({ resetCurrentMode: true });
      });
  
      el.inpShort.addEventListener("change", () => {
        state.settings.shortMin = num(el.inpShort.value, 1, 60, 5);
        onSettingsChanged({ resetCurrentMode: true });
      });
  
      el.inpLong.addEventListener("change", () => {
        state.settings.longMin = num(el.inpLong.value, 1, 120, 15);
        onSettingsChanged({ resetCurrentMode: true });
      });
  
      el.inpLongEvery.addEventListener("change", () => {
        state.settings.longEvery = num(el.inpLongEvery.value, 2, 12, 4);
        renderTimer();
        save();
      });
  
      el.togAutoBreak.addEventListener("change", () => {
        state.settings.autoBreak = el.togAutoBreak.checked;
        save();
      });
  
      el.togAutoFocus.addEventListener("change", () => {
        state.settings.autoFocus = el.togAutoFocus.checked;
        save();
      });
  
      el.selSound.addEventListener("change", () => {
        state.settings.sound = el.selSound.value;
        save();
      });
  
      el.rngVol.addEventListener("input", () => {
        state.settings.volume = clamp(Number(el.rngVol.value) / 100, 0, 1);
        save();
      });
  
      el.inpFocusTitle.addEventListener("input", () => {
        state.settings.focusTitle = el.inpFocusTitle.value.slice(0, 120);
        renderTimer();
        save();
      });
  
      el.btnToggleSync.addEventListener("click", () => {
        state.settings.duoSync = !state.settings.duoSync;
        applySettingsToInputs();
        renderTimer();
        save();
      });
  
      el.nameLud.addEventListener("input", () => {
        state.goals.lud.name = el.nameLud.value.slice(0, 30) || "Ludmila";
        save();
      });
  
      el.namePri.addEventListener("input", () => {
        state.goals.pri.name = el.namePri.value.slice(0, 30) || "Priscila";
        save();
      });
    }
  
    // ---------- UI Bind ----------
    function bindUI() {
      // Mode buttons
      el.modes.forEach((b) => {
        b.addEventListener("click", () => {
          applyMode(b.dataset.mode, { reset: true, playSwitch: true });
        });
      });
  
      el.btnStart.addEventListener("click", () => startTimer());
      el.btnPause.addEventListener("click", () => {
        stopTimer();
        renderTimer();
      });
  
      el.btnReset.addEventListener("click", () => resetTimerOnly());
      el.btnResetAll.addEventListener("click", () => resetAll());
      el.btnSkip.addEventListener("click", () => skipSession());
  
      el.btnRequestNotif.addEventListener("click", async () => {
        const ok = await requestNotifications();
        el.btnRequestNotif.textContent = ok ? "🔔 Ativo" : "🔕 Bloqueado";
        save();
      });
  
      el.btnSoundTest.addEventListener("click", () => {
        ensureAudio();
        playTransitionSound("end");
      });
  
      // Spacebar toggles start/pause
      window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
          e.preventDefault();
          if (state.isRunning) {
            stopTimer();
            renderTimer();
          } else {
            startTimer();
          }
        }
      });
    }
  
    // ---------- Goals Logic ----------
    function uid() {
      return Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
  
    function renderGoals() {
      const renderList = (person, listEl) => {
        const items = state.goals[person].items || [];
        listEl.innerHTML = "";
  
        items.forEach((it) => {
          const li = document.createElement("li");
          li.className = "item" + (it.done ? " done" : "");
  
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!it.done;
          cb.addEventListener("change", () => {
            it.done = cb.checked;
            renderGoals();
            save();
          });
  
          const txt = document.createElement("div");
          txt.className = "txt";
          txt.textContent = it.text;
  
          const del = document.createElement("button");
          del.className = "x";
          del.type = "button";
          del.title = "Remover";
          del.textContent = "✕";
          del.addEventListener("click", () => {
            state.goals[person].items = items.filter((x) => x.id !== it.id);
            renderGoals();
            save();
          });
  
          li.appendChild(cb);
          li.appendChild(txt);
          li.appendChild(del);
          listEl.appendChild(li);
        });
      };
  
      renderList("lud", el.listLud);
      renderList("pri", el.listPri);
  
      const stats = (person) => {
        const items = state.goals[person].items || [];
        const done = items.filter((x) => x.done).length;
        return { done, total: items.length };
      };
  
      const sL = stats("lud");
      const sP = stats("pri");
  
      el.doneLud.textContent = String(sL.done);
      el.totalLud.textContent = String(sL.total);
      el.donePri.textContent = String(sP.done);
      el.totalPri.textContent = String(sP.total);
  
      el.badgeSync.textContent = state.settings.duoSync ? "🤝 Sincronia: ON" : "🧩 Sincronia: OFF";
    }
  
    function bindGoals() {
      const addItem = (person, inputEl) => {
        const text = (inputEl.value || "").trim();
        if (!text) return;
        state.goals[person].items.unshift({ id: uid(), text: text.slice(0, 120), done: false });
        inputEl.value = "";
        renderGoals();
        save();
      };
  
      el.formAddLud.addEventListener("submit", (e) => {
        e.preventDefault();
        addItem("lud", el.inpAddLud);
      });
  
      el.formAddPri.addEventListener("submit", (e) => {
        e.preventDefault();
        addItem("pri", el.inpAddPri);
      });
  
      el.btnClearLud.addEventListener("click", () => {
        state.goals.lud.items = (state.goals.lud.items || []).filter((x) => !x.done);
        renderGoals(); save();
      });
      el.btnClearPri.addEventListener("click", () => {
        state.goals.pri.items = (state.goals.pri.items || []).filter((x) => !x.done);
        renderGoals(); save();
      });
  
      el.btnWipeLud.addEventListener("click", () => {
        state.goals.lud.items = [];
        renderGoals(); save();
      });
      el.btnWipePri.addEventListener("click", () => {
        state.goals.pri.items = [];
        renderGoals(); save();
      });
    }
  
    // ---------- Particles Background ----------
    function initParticles() {
      const canvas = $("#particles");
      const ctx = canvas.getContext("2d");
      let w = 0, h = 0, dpr = 1;
  
      const particles = [];
      const N = 70;
  
      function resize() {
        dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        w = canvas.clientWidth = window.innerWidth;
        h = canvas.clientHeight = window.innerHeight;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
  
      function spawn() {
        particles.length = 0;
        for (let i = 0; i < N; i++) {
          particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 1 + Math.random() * 2.2,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            a: 0.20 + Math.random() * 0.35
          });
        }
      }
  
      function step() {
        ctx.clearRect(0, 0, w, h);
  
        // links suaves
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
  
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
  
          // desenha bolinhas
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${p.a})`;
          ctx.fill();
  
          // conexões
          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 140) {
              const alpha = (1 - dist / 140) * 0.18;
              ctx.strokeStyle = `rgba(124,243,208,${alpha})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }
        }
  
        requestAnimationFrame(step);
      }
  
      window.addEventListener("resize", () => {
        resize();
        spawn();
      });
  
      resize();
      spawn();
      step();
    }
  
    // ---------- Init ----------
    function init() {
      load();
      applySettingsToInputs();
  
      // Ajusta timer ao modo carregado
      state.totalSec = getModeSeconds(state.mode);
      // Se o storage tinha um remainingSec fora do range, corrige
      state.remainingSec = clamp(state.remainingSec, 0, state.totalSec);
  
      bindUI();
      bindSettings();
      bindGoals();
      renderGoals();
      renderTimer();
      initParticles();
    }
  
    init();
  })();
  