// Cinderpine Express — Ticket-Booth UI, Marquee HUD, Dispatch Lever & Keyboard Shortcuts
(function() {
  const CPE = window.CPE = window.CPE || {};

  CPE.UI = {
    uiTheme: 'dark', // 'dark' | 'light'
    sheetOpen: false,

    init() {
      this.buildTicketCards();
      this.bindControls();
      this.bindEvents();
      this.updateCoasterStats(CPE.RIDE.coaster);
    },

    buildTicketCards() {
      const container = document.getElementById('ticket-list');
      if (!container) return;
      container.innerHTML = '';

      CPE.COASTERS.forEach((coaster, idx) => {
        const card = document.createElement('div');
        card.className = 'ride-ticket' + (idx === CPE.RIDE.coasterIndex ? ' active' : '');
        card.dataset.index = idx;

        const badgeHex = '#' + coaster.colorPrimary.toString(16).padStart(6, '0');
        card.innerHTML = `
          <div class="ticket-stub-left" style="background:${badgeHex}">
            <span class="stub-num">0${idx + 1}</span>
            <span class="stub-type">${coaster.type.toUpperCase()}</span>
          </div>
          <div class="ticket-body">
            <div class="ticket-header">
              <div class="ticket-title">${coaster.name}</div>
              <div class="ticket-rating-pill">${coaster.stats.excitement} EXC</div>
            </div>
            <div class="ticket-subtitle">${coaster.subtitle}</div>
            <div class="ticket-mini-stats">
              <span><b>${coaster.stats.maxHeight}m</b> Peak</span>
              <span><b>${Math.round(coaster.stats.maxSpeedKmh)}</b> km/h</span>
              <span><b>${coaster.stats.maxPosG}g</b> Max</span>
              <span><b>${coaster.stats.length}m</b> Track</span>
            </div>
            <div class="on-track-stamp">ON THE TRACK</div>
          </div>
        `;

        card.addEventListener('click', () => {
          CPE.RIDE.selectCoaster(idx);
        });

        container.appendChild(card);
      });
    },

    updateCoasterStats(coaster) {
      // Highlight active ticket
      const cards = document.querySelectorAll('.ride-ticket');
      cards.forEach((c, i) => {
        if (i === CPE.RIDE.coasterIndex) c.classList.add('active');
        else c.classList.remove('active');
      });

      const s = coaster.stats;
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setTxt('stat-coaster-name', coaster.name);
      setTxt('stat-coaster-desc', coaster.description);
      setTxt('stat-excitement', `${s.excitement.toFixed(1)} (${s.ratingLabel})`);
      setTxt('stat-intensity', `${s.intensity.toFixed(1)}`);
      setTxt('stat-nausea', `${s.nausea.toFixed(1)}`);
      setTxt('stat-length', `${s.length} m`);
      setTxt('stat-drop', `${s.maxDrop} m`);
      setTxt('stat-topspeed', `${s.maxSpeedKmh} km/h`);
      setTxt('stat-maxg', `+${s.maxPosG}g / ${s.minNegG}g`);
      setTxt('stat-airtime', `${s.airtimeSec} s`);
      setTxt('stat-inversions', `${s.inversions}`);
    },

    bindControls() {
      // Camera buttons
      document.querySelectorAll('[data-cam]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.cam;
          CPE.RENDER.setCameraMode(mode);
          this.syncCameraButtons();
        });
      });

      // Quarter-turn orbit buttons
      const btnTurnL = document.getElementById('btn-turn-left');
      const btnTurnR = document.getElementById('btn-turn-right');
      if (btnTurnL) btnTurnL.addEventListener('click', () => CPE.RENDER.quarterTurn(-1));
      if (btnTurnR) btnTurnR.addEventListener('click', () => CPE.RENDER.quarterTurn(1));

      // Time of day buttons (Day / Dusk / Night)
      document.querySelectorAll('[data-tod]').forEach(btn => {
        btn.addEventListener('click', () => {
          CPE.RENDER.setTimeOfDay(btn.dataset.tod);
          this.syncTodButtons();
        });
      });

      // Speed multiplier buttons (x1 / x2 / x4)
      document.querySelectorAll('[data-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sp = parseInt(btn.dataset.speed, 10) || 1;
          CPE.RIDE.timeScale = sp;
          this.syncSpeedButtons();
        });
      });

      // Pixel size slider (1 - 6 px)
      const pxSlider = document.getElementById('pixel-slider');
      const pxVal = document.getElementById('pixel-val');
      if (pxSlider) {
        pxSlider.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10) || 2;
          CPE.RENDER.setPixelSize(v);
          if (pxVal) pxVal.textContent = `${v}px`;
        });
      }

      // Cherry Dispatch Lever
      const leverWrap = document.getElementById('dispatch-lever-wrap');
      if (leverWrap) {
        leverWrap.addEventListener('click', () => {
          this.pullDispatchLever();
        });
      }

      // Audio Mute toggle
      const btnMute = document.getElementById('btn-mute');
      if (btnMute) {
        btnMute.addEventListener('click', () => {
          if (CPE.AUDIO && CPE.AUDIO.toggleMute) {
            const muted = CPE.AUDIO.toggleMute();
            btnMute.textContent = muted ? '🔇 Muted' : '🔊 Sound';
            btnMute.classList.toggle('muted', muted);
          }
        });
      }

      // Light / Dark UI Theme toggle
      const btnTheme = document.getElementById('btn-theme');
      if (btnTheme) {
        btnTheme.addEventListener('click', () => {
          this.uiTheme = this.uiTheme === 'dark' ? 'light' : 'dark';
          document.body.classList.toggle('theme-light', this.uiTheme === 'light');
          btnTheme.textContent = this.uiTheme === 'light' ? '🌙 Booth Dark' : '☀️ Booth Cream';
        });
      }

      // Mobile bottom sheet toggle
      const sheetHandle = document.getElementById('mobile-sheet-toggle');
      const boothPanel = document.getElementById('ticket-booth-panel');
      if (sheetHandle && boothPanel) {
        sheetHandle.addEventListener('click', () => {
          this.sheetOpen = !this.sheetOpen;
          boothPanel.classList.toggle('sheet-open', this.sheetOpen);
        });
      }

      // Keyboard Shortcuts:
      // 1-4: Cameras, Space: Dispatch, Q/E: Quarter-turn orbit, [ ]: Cycle coasters, X: Speed x1/x2/x4
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        const key = e.key.toLowerCase();
        if (key === '1') { CPE.RENDER.setCameraMode('park'); this.syncCameraButtons(); }
        else if (key === '2') { CPE.RENDER.setCameraMode('follow'); this.syncCameraButtons(); }
        else if (key === '3') { CPE.RENDER.setCameraMode('chase'); this.syncCameraButtons(); }
        else if (key === '4') { CPE.RENDER.setCameraMode('fpv'); this.syncCameraButtons(); }
        else if (e.code === 'Space') {
          e.preventDefault();
          this.pullDispatchLever();
        } else if (key === 'q') {
          CPE.RENDER.quarterTurn(-1);
        } else if (key === 'e') {
          if (!CPE.STORY || (!CPE.STORY.activeInteractable && CPE.STORY.mode !== 'DIALOGUE')) {
            CPE.RENDER.quarterTurn(1);
          }
        } else if (e.key === '[') {
          const next = (CPE.RIDE.coasterIndex + CPE.COASTERS.length - 1) % CPE.COASTERS.length;
          CPE.RIDE.selectCoaster(next);
        } else if (e.key === ']') {
          const next = (CPE.RIDE.coasterIndex + 1) % CPE.COASTERS.length;
          CPE.RIDE.selectCoaster(next);
        } else if (key === 'x') {
          const scales = [1, 2, 4];
          const nextIdx = (scales.indexOf(CPE.RIDE.timeScale) + 1) % scales.length;
          CPE.RIDE.timeScale = scales[nextIdx];
          this.syncSpeedButtons();
        } else if (key === 'm') {
          if (btnMute) btnMute.click();
        }
      });
    },

    pullDispatchLever() {
      const lever = document.getElementById('dispatch-lever-wrap');
      if (lever) {
        lever.classList.add('pulled');
        setTimeout(() => lever.classList.remove('pulled'), 550);
      }
      CPE.RIDE.dispatch();
    },

    syncCameraButtons() {
      document.querySelectorAll('[data-cam]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cam === CPE.RENDER.cameraMode);
      });
    },

    syncTodButtons() {
      document.querySelectorAll('[data-tod]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tod === CPE.RENDER.timeOfDay);
      });
    },

    syncSpeedButtons() {
      document.querySelectorAll('[data-speed]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.speed, 10) === CPE.RIDE.timeScale);
      });
    },

    bindEvents() {
      CPE.events.on('coasterChanged', ({ coaster }) => {
        this.updateCoasterStats(coaster);
      });

      CPE.events.on('toast', ({ text, subtitle, color }) => {
        this.showToast(text, subtitle, color);
      });
    },

    showToast(text, subtitle = '', color = '#f2c94c') {
      const stage = document.getElementById('toast-stage');
      if (!stage) return;
      const el = document.createElement('div');
      el.className = 'coaster-toast';
      el.style.borderColor = color;
      el.innerHTML = `
        <div class="toast-main" style="color:${color}">${text}</div>
        ${subtitle ? `<div class="toast-sub">${subtitle}</div>` : ''}
      `;
      stage.appendChild(el);
      setTimeout(() => {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 350);
      }, 1900);
    },

    updateHUD() {
      const ride = CPE.RIDE;
      const smp = ride.currentSample;
      if (!smp) return;

      const speedKmh = (ride.speed * 3.6).toFixed(0);
      const heightM = Math.max(0, smp.pos.y).toFixed(1);
      const vG = smp.liveVG !== undefined ? smp.liveVG : 1.0;

      const elSpeed = document.getElementById('hud-speed');
      const elHeight = document.getElementById('hud-height');
      const elG = document.getElementById('hud-g');
      const elGBar = document.getElementById('hud-g-fill');
      const elSection = document.getElementById('hud-section');
      const elLap = document.getElementById('hud-lap');
      const elLeverStatus = document.getElementById('lever-status');
      const elLeverWrap = document.getElementById('dispatch-lever-wrap');

      if (elSpeed) elSpeed.textContent = speedKmh;
      if (elHeight) elHeight.textContent = heightM;
      if (elG) {
        elG.textContent = `${vG >= 0 ? '+' : ''}${vG.toFixed(1)}g`;
        elG.style.color = vG < 0.25 ? '#61b4c2' : (vG > 3.2 ? '#eb5e4d' : '#f2c94c');
      }
      if (elGBar) {
        // Map -1g..4.5g to 0..100%
        const pct = Math.max(4, Math.min(100, ((vG + 1.0) / 5.5) * 100));
        elGBar.style.width = `${pct}%`;
        elGBar.style.background = vG < 0.25 ? '#61b4c2' : (vG > 3.2 ? '#d9383a' : '#f2c94c');
      }
      if (elSection) {
        if (ride.state === 'BOARD') {
          elSection.textContent = `BOARDING (${Math.ceil(ride.boardCountdown)}s)`;
        } else if (ride.state === 'UNLOAD') {
          elSection.textContent = 'UNLOADING';
        } else {
          elSection.textContent = smp.sectionName.toUpperCase();
        }
      }
      if (elLap) {
        elLap.textContent = `${ride.lapTime.toFixed(1)}s`;
      }
      if (elLeverStatus && elLeverWrap) {
        const ready = (ride.state === 'BOARD' || ride.state === 'UNLOAD');
        elLeverWrap.classList.toggle('ready', ready);
        elLeverStatus.textContent = ready
          ? `PULL OR [SPACE] (${Math.max(0, Math.ceil(ride.boardCountdown))}s)`
          : ride.state;
      }
    }
  };
})();
