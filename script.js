// ===== LASER DIFFRACTION VIRTUAL LAB — MAIN SCRIPT =====

// Polyfill for CanvasRenderingContext2D.roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
  };
}

// ===== STATE =====
const state = {
  laserOn: false,
  gratingPlaced: false,
  linesPerCm: 5000,
  actualWavelength: 650, // nm
  detectorAngle: 0,
  vernierConstant: 1/180, // LC = 1/180 degree
  recordedReadings: {},
  // Computed
  get pitch() { return 1 / this.linesPerCm; }, // cm
  get pitchMicrons() { return this.pitch * 1e4; }, // micrometers
};

// Quiz answers (0-indexed correct answer)
const quizAnswers = {
  q1: 1, q2: 1, q3: 2, q4: 1, q5: 1,
  q6: 1, q7: 1, q8: 0, q9: 0, q10: 1
};

const quizExplanations = {
  q1: "LASER stands for Light Amplification by Stimulated Emission of Radiation.",
  q2: "Laser light is coherent (waves in phase), monochromatic (single wavelength), and highly directional (collimated beam).",
  q3: "Diffraction is the bending of light waves around obstacles or through narrow openings, a fundamental wave phenomenon.",
  q4: "A semiconductor diode laser uses a p-n junction where charge carrier recombination produces coherent light.",
  q5: "This experiment uses Fraunhofer (far-field) diffraction, where the source and screen are effectively at infinity (achieved using spectrometer optics).",
  q6: "A plane transmission grating is an optically flat glass plate with thousands of equally spaced parallel slits ruled on it.",
  q7: "White light contains all wavelengths, so each order produces a spectrum (rainbow) because different wavelengths diffract at different angles.",
  q8: "In stimulated emission, an incident photon triggers an excited atom to emit an identical photon (same phase, frequency, direction). Spontaneous emission is random.",
  q9: "The eye's lens focuses the coherent, collimated laser beam onto an extremely small spot on the retina, causing concentrated thermal damage.",
  q10: "Wider slits produce narrower diffraction patterns because the angular spread is inversely proportional to slit width (θ ∝ λ/a)."
};

const quizSelected = {};

// ===== DIFFRACTION PHYSICS =====
function getOrderAngles() {
  const d = state.pitch; // cm
  const lambda = state.actualWavelength * 1e-7; // cm
  const angles = {};
  for (let m = 1; m <= 5; m++) {
    const sinTheta = m * lambda / d;
    if (sinTheta < 1) {
      angles[m] = Math.asin(sinTheta) * (180 / Math.PI);
    }
  }
  return angles;
}

function getIntensityAtAngle(angleDeg) {
  if (!state.laserOn || !state.gratingPlaced) return 0;
  const d = state.pitch * 1e4; // micrometers
  const lambda = state.actualWavelength * 1e-3; // micrometers
  const N = 500; // number of slits illuminated
  const a = d * 0.4; // slit width ~40% of pitch

  const thetaRad = angleDeg * Math.PI / 180;
  if (Math.abs(thetaRad) < 1e-10) return 100;

  const alpha = Math.PI * a * Math.sin(thetaRad) / lambda;
  const beta = Math.PI * d * Math.sin(thetaRad) / lambda;

  const singleSlit = alpha === 0 ? 1 : Math.pow(Math.sin(alpha) / alpha, 2);
  const multiSlit = Math.pow(Math.sin(N * beta) / (N * Math.sin(beta)), 2);

  return Math.min(100, singleSlit * multiSlit * 100);
}

function findNearestOrder(angleDeg) {
  if (Math.abs(angleDeg) < 0.5) return 0;
  const angles = getOrderAngles();
  let bestOrder = null;
  let bestDiff = Infinity;
  for (const [m, a] of Object.entries(angles)) {
    const diff = Math.abs(Math.abs(angleDeg) - a);
    if (diff < bestDiff && diff < 2) {
      bestDiff = diff;
      bestOrder = parseInt(m);
    }
  }
  return bestOrder !== null ? (angleDeg < 0 ? -bestOrder : bestOrder) : null;
}

// ===== ADD VERNIER NOISE =====
function addNoise(value, magnitude = 0.02) {
  return value + (Math.random() - 0.5) * magnitude;
}

// ===== VERNIER SCALE READINGS =====
function getVernierReadings(angleDeg) {
  // LC = 1/180 degree, MSR divisions = 0.5 degree
  // Vernier has 90 divisions (0.5 / (1/180) = 90)
  const LC = state.vernierConstant; // 1/180 degree
  let noisy = addNoise(angleDeg, 0.02);
  noisy = (noisy % 360 + 360) % 360; // normalize to 0-360
  
  // Vernier I
  const msr1 = Math.floor(noisy * 2) / 2; // nearest lower 0.5° division
  const remainder1 = noisy - msr1;
  const vsd1 = Math.round(remainder1 / LC); // which vernier division coincides
  const total1 = msr1 + vsd1 * LC;
  
  // Vernier II = Vernier I + 180° (diametrically opposite), wrapped to 0-360°
  const noisy2 = (total1 + 180) % 360;
  const msr2 = Math.floor(noisy2 * 2) / 2;
  const remainder2 = noisy2 - msr2;
  const vsd2 = Math.round(remainder2 / LC);
  const total2 = msr2 + vsd2 * LC;
  
  return {
    msr1: msr1.toFixed(2),
    vsd1: vsd1, // vernier scale division number (0-89)
    vsr1: (vsd1 * LC).toFixed(4), // VSR in degrees
    total1: total1.toFixed(4),
    msr2: msr2.toFixed(2),
    vsd2: vsd2,
    vsr2: (vsd2 * LC).toFixed(4),
    total2: total2.toFixed(4),
    angleDeg: noisy
  };
}

// ===== HELPERS =====
function isMobile() {
  return window.innerWidth <= 768;
}

function getCanvasHeight(desktopH, mobileH, smallH) {
  if (window.innerWidth <= 400) return smallH || mobileH;
  if (window.innerWidth <= 768) return mobileH;
  return desktopH;
}

// Debounce utility
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ===== NAVIGATION =====
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initHeroCanvas();
  initDiagramCanvas();
  initSimulationCanvas();
  initSpectrometerCanvas();
  initTouchControls();
  setupTableListeners();

  const handleResize = debounce(() => {
    initDiagramCanvas();
    resizeSimCanvas();
    drawSimulation();
    drawSpectrometer();
  }, 200);

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 300);
  });
});

function initNavigation() {
  const navItems = document.querySelectorAll('.custom-nav-item');
  const pages = document.querySelectorAll('.tab-page');

  function showTab(tabId) {
    // Hide all pages
    pages.forEach(page => {
      page.classList.remove('active-page');
    });

    // Remove active class from all nav items
    navItems.forEach(item => {
      item.classList.remove('active');
    });

    // Show selected page
    const activePage = document.getElementById(`page-${tabId}`);
    if (activePage) {
      activePage.classList.add('active-page');
    }

    // Set active class on nav item
    const activeNav = document.querySelector(`.custom-nav-item[data-tab="${tabId}"]`);
    if (activeNav) {
      activeNav.classList.add('active');
    }

    // Update URL hash
    if (history.replaceState) {
      history.replaceState(null, null, `#${tabId}`);
    } else {
      window.location.hash = tabId;
    }

    // Reset window scroll to top on tab change
    window.scrollTo(0, 0);

    // Trigger canvas resizing and redraws if we switched to the Experiment page!
    if (tabId === 'experiment') {
      setTimeout(() => {
        // Re-initialize and resize canvases so they fit correctly after display: none -> block
        initSimulationCanvas();
        initSpectrometerCanvas();
        resizeSimCanvas();
        drawSimulation();
        drawSpectrometer();
      }, 50); // small delay to allow DOM transition to finish
    }
  }

  // Click event listeners
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      showTab(tabId);
    });
  });

  // Handle URL hash on load
  const currentHash = window.location.hash.replace('#', '');
  const validTabs = ['theory', 'apparatus', 'experiment'];
  if (validTabs.includes(currentHash)) {
    showTab(currentHash);
  } else {
    showTab('theory'); // default
  }

  // Handle browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (validTabs.includes(hash)) {
      showTab(hash);
    }
  });
}

// ===== HERO CANVAS (PARTICLE EFFECTS) =====
function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Create particles
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
      color: Math.random() > 0.5 ? '#ff1744' : '#7c4dff'
    });
  }

  // Laser beam effect
  let beamPhase = 0;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    beamPhase += 0.02;

    // Draw a faint laser beam across
    const beamY = canvas.height * 0.55;
    const gradient = ctx.createLinearGradient(0, beamY - 2, 0, beamY + 2);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.5, `rgba(255, 23, 68, ${0.08 + Math.sin(beamPhase) * 0.04})`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, beamY - 20, canvas.width, 40);

    // Draw central glow
    const glow = ctx.createRadialGradient(
      canvas.width / 2, beamY, 0,
      canvas.width / 2, beamY, 100
    );
    glow.addColorStop(0, `rgba(255, 23, 68, ${0.1 + Math.sin(beamPhase * 1.5) * 0.05})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(canvas.width / 2 - 100, beamY - 100, 200, 200);

    // Draw particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace(')', `, ${p.alpha})`).replace('rgb', 'rgba').replace('#ff1744', `rgba(255, 23, 68, ${p.alpha})`).replace('#7c4dff', `rgba(124, 77, 255, ${p.alpha})`);
      // Simple fill with hex alpha
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    requestAnimationFrame(animate);
  }
  animate();
}

// ===== DIAGRAM CANVAS =====
function initDiagramCanvas() {
  const canvas = document.getElementById('diagramCanvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const H = getCanvasHeight(350, 250, 200);

  canvas.width = rect.width * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const W = rect.width;

  ctx.clearRect(0, 0, W, H);

  // Optical bench
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(40, H - 60, W - 80, 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(40, H - 60, W - 80, 8);

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Optical Bench (~1m)', W / 2, H - 35);

  // Laser source (right side)
  const laserX = W - 120;
  const laserY = H / 2 - 10;

  // Laser body
  ctx.fillStyle = '#1a1a3a';
  ctx.strokeStyle = '#ff1744';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(laserX, laserY - 15, 80, 30, 6);
  ctx.fill();
  ctx.stroke();

  // Laser label
  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 10px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('LASER', laserX + 40, laserY + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Inter';
  ctx.fillText('Source', laserX + 40, laserY + 40);

  // Target holder
  const targetX = W * 0.6;
  ctx.fillStyle = '#1a1a3a';
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.fillRect(targetX - 3, laserY - 30, 6, 60);
  ctx.strokeRect(targetX - 3, laserY - 30, 6, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Inter';
  ctx.fillText('Target Holder', targetX, laserY + 50);

  // Grating
  const gratingX = W * 0.4;
  ctx.strokeStyle = '#7c4dff';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(gratingX, laserY - 40);
  ctx.lineTo(gratingX, laserY + 40);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#7c4dff';
  ctx.font = 'bold 10px Inter';
  ctx.fillText('Diffraction', gratingX, laserY - 50);
  ctx.fillText('Grating', gratingX, laserY - 38);

  // Screen (left side)
  const screenX = 60;
  ctx.fillStyle = '#1a1a3a';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.fillRect(screenX, laserY - 80, 6, 160);
  ctx.strokeRect(screenX, laserY - 80, 6, 160);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Inter';
  ctx.fillText('Screen', screenX + 3, laserY + 100);
  ctx.fillText('(Wall)', screenX + 3, laserY + 115);

  // Laser beam (main)
  ctx.strokeStyle = 'rgba(255, 23, 68, 0.8)';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff1744';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(laserX, laserY);
  ctx.lineTo(gratingX, laserY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Diffracted beams
  const orders = getOrderAngles();
  const beamColors = ['#ff4444', '#ff6666', '#ff8888', '#ffaaaa', '#ffcccc'];

  // Central beam (m=0)
  ctx.strokeStyle = 'rgba(255, 23, 68, 0.7)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#ff1744';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(gratingX, laserY);
  ctx.lineTo(screenX + 6, laserY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Higher orders
  Object.entries(orders).forEach(([m, angle], i) => {
    const thetaRad = angle * Math.PI / 180;
    const dx = gratingX - screenX;
    const dy = dx * Math.tan(thetaRad);
    const alpha = Math.max(0.2, 0.7 - i * 0.15);

    // Upper diffracted beam
    ctx.strokeStyle = `rgba(255, 68, 68, ${alpha})`;
    ctx.lineWidth = Math.max(1, 2.5 - i * 0.5);
    ctx.beginPath();
    ctx.moveTo(gratingX, laserY);
    ctx.lineTo(screenX + 6, laserY - dy);
    ctx.stroke();

    // Lower diffracted beam
    ctx.beginPath();
    ctx.moveTo(gratingX, laserY);
    ctx.lineTo(screenX + 6, laserY + dy);
    ctx.stroke();

    // Dots on screen
    ctx.fillStyle = `rgba(255, 23, 68, ${alpha + 0.2})`;
    ctx.beginPath();
    ctx.arc(screenX + 3, laserY - dy, 4 - i * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(screenX + 3, laserY + dy, 4 - i * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Order labels
    const orderLabel = i === 0 ? '1st Order' : (i === 1 ? '2nd Order' : (i === 2 ? '3rd Order' : `m=${m}`));
    ctx.fillStyle = `rgba(255,255,255,${0.4 + alpha})`;
    ctx.font = 'bold 9px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(orderLabel, screenX + 14, laserY - dy + 3);
    ctx.fillText(orderLabel, screenX + 14, laserY + dy + 3);
  });

  // Central dot on screen
  ctx.fillStyle = 'rgba(255, 23, 68, 1)';
  ctx.shadowColor = '#ff1744';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(screenX + 3, laserY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 9px Inter';
  ctx.textAlign = 'left';
  ctx.fillText('Central Spot', screenX + 14, laserY + 3);

  // Distance label
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(screenX + 6, H - 75);
  ctx.lineTo(gratingX, H - 75);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('D (about 1m)', (screenX + gratingX) / 2, H - 80);
}

// ===== SIMULATION CANVAS =====
let simCtx, simCanvas;

function initSimulationCanvas() {
  simCanvas = document.getElementById('simCanvas');
  simCtx = simCanvas.getContext('2d');
  resizeSimCanvas();
  drawSimulation();
}

function resizeSimCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = simCanvas.getBoundingClientRect();
  const h = getCanvasHeight(500, 300, 250);
  simCanvas.width = rect.width * dpr;
  simCanvas.height = h * dpr;
  simCanvas.style.height = h + 'px';
  simCtx.scale(dpr, dpr);
}

function drawSimulation() {
  if (!simCtx) return;
  const W = simCanvas.getBoundingClientRect().width;
  const H = getCanvasHeight(500, 300, 250);
  const ctx = simCtx;
  const dpr = window.devicePixelRatio || 1;

  // Reset transform and clear
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#020208';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  const centerY = H / 2;
  const laserX = W - 100;
  const gratingX = W * 0.5;
  const screenX = 40;

  // === Optical bench ===
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(30, H - 40, W - 60, 6);

  // === Laser module ===
  // Body
  const laserGrad = ctx.createLinearGradient(laserX - 5, centerY - 20, laserX + 70, centerY + 20);
  laserGrad.addColorStop(0, '#2a1a2a');
  laserGrad.addColorStop(1, '#1a0a1a');
  ctx.fillStyle = laserGrad;
  ctx.beginPath();
  ctx.roundRect(laserX - 5, centerY - 20, 75, 40, 6);
  ctx.fill();
  ctx.strokeStyle = state.laserOn ? '#ff1744' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = state.laserOn ? 2 : 1;
  ctx.stroke();

  // Laser indicator
  ctx.fillStyle = state.laserOn ? '#ff1744' : '#333';
  ctx.beginPath();
  ctx.arc(laserX + 55, centerY - 10, 4, 0, Math.PI * 2);
  ctx.fill();
  if (state.laserOn) {
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Laser label
  ctx.fillStyle = state.laserOn ? '#ff4444' : 'rgba(255,255,255,0.3)';
  ctx.font = 'bold 10px "Orbitron", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LASER', laserX + 32, centerY + 5);

  // Aperture
  ctx.fillStyle = '#111';
  ctx.fillRect(laserX - 10, centerY - 5, 8, 10);

  // === Grating ===
  if (state.gratingPlaced) {
    // Grating frame
    ctx.fillStyle = 'rgba(124, 77, 255, 0.1)';
    ctx.strokeStyle = '#7c4dff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(gratingX - 4, centerY - 60, 8, 120, 2);
    ctx.fill();
    ctx.stroke();

    // Grating lines
    ctx.strokeStyle = 'rgba(124, 77, 255, 0.4)';
    ctx.lineWidth = 0.5;
    for (let y = centerY - 55; y < centerY + 55; y += 4) {
      ctx.beginPath();
      ctx.moveTo(gratingX - 3, y);
      ctx.lineTo(gratingX + 3, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#7c4dff';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Grating', gratingX, centerY + 80);
    ctx.fillStyle = 'rgba(124,77,255,0.5)';
    ctx.font = '9px "JetBrains Mono"';
    ctx.fillText(`${state.linesPerCm} lines/cm`, gratingX, centerY + 93);
  }

  // === Screen ===
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(screenX - 2, centerY - 120, 6, 240);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(screenX - 2, centerY - 120, 6, 240);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('Screen', screenX + 1, centerY + 140);

  // === Laser beam ===
  if (state.laserOn) {
    const beamEnd = state.gratingPlaced ? gratingX : screenX + 4;

    // Main beam glow
    const beamGrad = ctx.createLinearGradient(laserX - 10, centerY - 4, laserX - 10, centerY + 4);
    beamGrad.addColorStop(0, 'transparent');
    beamGrad.addColorStop(0.3, 'rgba(255, 23, 68, 0.15)');
    beamGrad.addColorStop(0.5, 'rgba(255, 23, 68, 0.8)');
    beamGrad.addColorStop(0.7, 'rgba(255, 23, 68, 0.15)');
    beamGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(beamEnd, centerY - 8, laserX - 10 - beamEnd, 16);

    // Core beam
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(laserX - 10, centerY);
    ctx.lineTo(beamEnd, centerY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Diffracted beams
    if (state.gratingPlaced) {
      const orders = getOrderAngles();

      // Central beam through grating
      ctx.strokeStyle = 'rgba(255, 23, 68, 0.7)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(gratingX, centerY);
      ctx.lineTo(screenX + 4, centerY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Central bright spot
      ctx.fillStyle = '#ff1744';
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(screenX + 1, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 9px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText('Central Spot', screenX + 12, centerY + 3);

      // Higher order beams
      Object.entries(orders).forEach(([m, angle], i) => {
        const thetaRad = angle * Math.PI / 180;
        const dx = gratingX - screenX;
        const dy = dx * Math.tan(thetaRad);
        const intensity = Math.max(0.15, 0.9 - i * 0.3); // Sharp drop-off
        const spotRadius = Math.max(1.5, 4.5 - i * 1.0); // Dots get smaller

        // Up beam
        ctx.strokeStyle = `rgba(255, 23, 68, ${intensity * 0.6})`;
        ctx.lineWidth = Math.max(1, 2.5 - i * 0.5);
        ctx.beginPath();
        ctx.moveTo(gratingX, centerY);
        ctx.lineTo(screenX + 4, centerY - dy);
        ctx.stroke();

        // Down beam
        ctx.beginPath();
        ctx.moveTo(gratingX, centerY);
        ctx.lineTo(screenX + 4, centerY + dy);
        ctx.stroke();

        // Spots on screen
        ctx.fillStyle = `rgba(255, 23, 68, ${intensity + 0.1})`;
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = Math.max(0, 15 - i * 5); // Glow decreases
        ctx.beginPath();
        ctx.arc(screenX + 1, centerY - dy, spotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screenX + 1, centerY + dy, spotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Labels
        const labelText = i === 0 ? '1st Order' : (i === 1 ? '2nd Order' : (i === 2 ? '3rd Order' : `m=${m}`));
        ctx.fillStyle = `rgba(255,255,255,${0.3 + intensity * 0.7})`;
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(labelText, screenX + 12, centerY - dy + 3);
        ctx.fillText(labelText, screenX + 12, centerY + dy + 3);
      });
    } else {
      // No grating — beam hits screen directly
      ctx.fillStyle = '#ff1744';
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(screenX + 1, centerY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // === Detector arm ===
  if (state.laserOn && state.gratingPlaced) {
    const thetaRad = state.detectorAngle * Math.PI / 180;
    const armLen = gratingX - screenX - 20;
    const detX = gratingX - Math.cos(thetaRad) * armLen;
    const detY = centerY - Math.sin(thetaRad) * armLen;

    // Detector arm line
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(gratingX, centerY);
    ctx.lineTo(detX, detY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Detector
    ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(detX, detY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Intensity indicator
    const intensity = getIntensityAtAngle(state.detectorAngle);
    if (intensity > 5) {
      ctx.fillStyle = `rgba(255, 23, 68, ${intensity / 100})`;
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = intensity / 5;
      ctx.beginPath();
      ctx.arc(detX, detY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Angle arc
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const arcR = 40;
    if (state.detectorAngle >= 0) {
      ctx.arc(gratingX, centerY, arcR, Math.PI, Math.PI + thetaRad, false);
    } else {
      ctx.arc(gratingX, centerY, arcR, Math.PI + thetaRad, Math.PI, false);
    }
    ctx.stroke();

    // Angle text
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`θ = ${Math.abs(state.detectorAngle).toFixed(1)}°`, gratingX - 60, centerY - 50);

    // Detector label
    ctx.fillStyle = 'rgba(0,229,255,0.6)';
    ctx.font = '9px Inter';
    ctx.fillText('Detector', detX, detY + 22);
  }

  // === Legend ===
  ctx.font = '10px Inter';
  ctx.textAlign = 'left';
  const legendY = 25;
  const legendItems = [
    { color: '#ff1744', label: 'Laser Beam' },
    { color: '#7c4dff', label: 'Grating' },
    { color: '#00e5ff', label: 'Detector' }
  ];
  legendItems.forEach((item, i) => {
    const x = W - 130;
    const y = legendY + i * 20;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y - 4, 12, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(item.label, x + 18, y + 4);
  });
}

// ===== SPECTROMETER CANVAS =====
let specCtx, specCanvas;

function initSpectrometerCanvas() {
  specCanvas = document.getElementById('spectrometerCanvas');
  specCtx = specCanvas.getContext('2d');
  drawSpectrometer();
}

function drawSpectrometer() {
  if (!specCtx) return;
  const canvas = specCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const H = getCanvasHeight(550, 420, 380);
  canvas.width = rect.width * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = specCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = rect.width;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#020208';
  ctx.fillRect(0, 0, W, H);

  // =========== TOP: SPECTROMETER TOP VIEW ===========
  const specH = H * 0.55; // top portion for spectrometer
  const cx = W / 2;
  const cy = specH / 2 + 10;
  const R = Math.min(W, specH) * 0.36;

  // Spectrometer body - outer ring with metallic gradient
  const bodyGrad = ctx.createRadialGradient(cx, cy, R - 5, cx, cy, R + 5);
  bodyGrad.addColorStop(0, 'rgba(60,60,80,0.3)');
  bodyGrad.addColorStop(0.5, 'rgba(40,40,60,0.5)');
  bodyGrad.addColorStop(1, 'rgba(20,20,40,0.2)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, 0, Math.PI * 2);
  ctx.fill();

  // Outer circle
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle (prism table area)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.25, 0, Math.PI * 2);
  ctx.stroke();

  // Degree markings on circular scale
  for (let deg = 0; deg < 360; deg += 1) {
    const rad = (deg - 90) * Math.PI / 180;
    const isMajor = deg % 30 === 0;
    const isMid = deg % 10 === 0;
    const isMinor5 = deg % 5 === 0;

    let innerR, lineWidth, alpha;
    if (isMajor) { innerR = R - 18; lineWidth = 2; alpha = 0.5; }
    else if (isMid) { innerR = R - 12; lineWidth = 1; alpha = 0.3; }
    else if (isMinor5) { innerR = R - 8; lineWidth = 0.8; alpha = 0.2; }
    else { innerR = R - 4; lineWidth = 0.3; alpha = 0.08; }

    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * innerR, cy + Math.sin(rad) * innerR);
    ctx.lineTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R);
    ctx.stroke();

    // Degree labels
    if (isMajor) {
      const labelR = R - 28;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${deg}°`, cx + Math.cos(rad) * labelR, cy + Math.sin(rad) * labelR);
    }
  }

  // Collimator arm (fixed, pointing right = 0°)
  ctx.strokeStyle = 'rgba(255, 23, 68, 0.6)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + R * 0.25, cy);
  ctx.lineTo(cx + R * 1.05, cy);
  ctx.stroke();

  // Collimator body (rectangular end)
  ctx.fillStyle = 'rgba(255, 23, 68, 0.15)';
  ctx.strokeStyle = 'rgba(255, 23, 68, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx + R * 0.85, cy - 10, 30, 20, 3);
  ctx.fill();
  ctx.stroke();

  // Laser source label
  ctx.fillStyle = state.laserOn ? '#ff4444' : '#444';
  ctx.font = 'bold 8px JetBrains Mono';
  ctx.textAlign = 'center';
  ctx.fillText('LASER', cx + R * 1.0, cy - 16);
  
  // Laser indicator LED
  if (state.laserOn) {
    ctx.fillStyle = '#ff1744';
    ctx.shadowColor = '#ff1744';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx + R * 1.0, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Telescope arm (moveable)
  const armAngle = (180 + state.detectorAngle) * Math.PI / 180;
  const armEndX = cx + Math.cos(armAngle) * R * 1.05;
  const armEndY = cy + Math.sin(armAngle) * R * 1.05;

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(armAngle) * R * 0.25, cy + Math.sin(armAngle) * R * 0.25);
  ctx.lineTo(armEndX, armEndY);
  ctx.stroke();

  // Telescope body
  const telesX = cx + Math.cos(armAngle) * R * 0.9;
  const telesY = cy + Math.sin(armAngle) * R * 0.9;
  ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(armEndX, armEndY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Detector label
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 8px JetBrains Mono';
  ctx.textAlign = 'center';
  ctx.fillText('DETECTOR', armEndX, armEndY - 14);

  // Vernier I position indicator (on telescope arm side)
  const v1Angle = armAngle;
  const v1X = cx + Math.cos(v1Angle) * (R - 2);
  const v1Y = cy + Math.sin(v1Angle) * (R - 2);
  ctx.fillStyle = '#00e6ff';
  ctx.beginPath();
  ctx.arc(v1X, v1Y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Vernier II position indicator (180° opposite)
  const v2Angle = armAngle + Math.PI;
  const v2X = cx + Math.cos(v2Angle) * (R - 2);
  const v2Y = cy + Math.sin(v2Angle) * (R - 2);
  ctx.fillStyle = '#ffab00';
  ctx.beginPath();
  ctx.arc(v2X, v2Y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Vernier labels
  ctx.font = '8px JetBrains Mono';
  ctx.fillStyle = '#00e6ff';
  ctx.fillText('V\u2081', v1X + (Math.cos(v1Angle) > 0 ? 12 : -12), v1Y + (Math.sin(v1Angle) > 0 ? 12 : -12));
  ctx.fillStyle = '#ffab00';
  ctx.fillText('V\u2082', v2X + (Math.cos(v2Angle) > 0 ? 12 : -12), v2Y + (Math.sin(v2Angle) > 0 ? 12 : -12));

  // Angle indicator arc
  if (Math.abs(state.detectorAngle) > 0.3) {
    ctx.strokeStyle = 'rgba(255, 171, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const startAngle = Math.PI;
    const endAngle = armAngle;
    ctx.arc(cx, cy, R * 0.35, Math.min(startAngle, endAngle), Math.max(startAngle, endAngle));
    ctx.stroke();
    ctx.setLineDash([]);

    // Angle value
    ctx.fillStyle = '#ffab00';
    ctx.font = 'bold 13px JetBrains Mono';
    ctx.textAlign = 'center';
    const midAngle = (startAngle + endAngle) / 2;
    ctx.fillText(
      `\u03B8 = ${Math.abs(state.detectorAngle).toFixed(2)}\u00B0`,
      cx + Math.cos(midAngle) * R * 0.22,
      cy + Math.sin(midAngle) * R * 0.22
    );
  }

  // Prism table (center) with grating
  if (state.gratingPlaced) {
    // Prism table circle
    ctx.fillStyle = 'rgba(124, 77, 255, 0.1)';
    ctx.strokeStyle = 'rgba(124, 77, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Grating element (vertical line through center)
    ctx.strokeStyle = '#7c4dff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 0.18);
    ctx.lineTo(cx, cy + R * 0.18);
    ctx.stroke();

    // Grating lines detail
    ctx.strokeStyle = 'rgba(124, 77, 255, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = -6; i <= 6; i++) {
      const gy = cy + i * (R * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx - 4, gy);
      ctx.lineTo(cx + 4, gy);
      ctx.stroke();
    }

    // Grating label with d value
    ctx.fillStyle = '#b388ff';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('GRATING', cx, cy + R * 0.22 + 14);
    ctx.fillStyle = 'rgba(179,136,255,0.7)';
    ctx.font = '8px JetBrains Mono';
    ctx.fillText(`d = ${state.pitch.toExponential(3)} cm`, cx, cy + R * 0.22 + 26);
    ctx.fillText(`(${state.linesPerCm} lines/cm)`, cx, cy + R * 0.22 + 37);
  }

  // Component labels
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '9px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Spectrometer \u2014 Top View', cx, specH - 2);

  // Legend
  ctx.font = '8px JetBrains Mono';
  ctx.textAlign = 'left';
  const lx = 10;
  [
    { color: '#ff1744', label: 'Collimator (Laser)' },
    { color: '#00e5ff', label: 'Telescope (Detector)' },
    { color: '#7c4dff', label: 'Grating' },
    { color: '#00e6ff', label: 'Vernier I (V\u2081)' },
    { color: '#ffab00', label: 'Vernier II (V\u2082 = V\u2081 + 180\u00B0)' }
  ].forEach((item, i) => {
    const y = 16 + i * 14;
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, y - 4, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(item.label, lx + 13, y + 3);
  });

  // =========== BOTTOM: REALISTIC MSR + VSR SCALE VIEW ===========
  drawVernierScaleCloseup(ctx, W, specH, H - specH);
}

// ===== REALISTIC VERNIER SCALE CLOSE-UP =====
function drawVernierScaleCloseup(ctx, W, startY, availH) {
  const readings = getVernierReadings(state.detectorAngle);
  const padding = 20;
  const scaleW = W - padding * 2;
  const scaleStartX = padding;
  const scaleY = startY + 15;

  // Title bar
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, startY, W, availH);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.lineTo(W, startY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
  ctx.font = 'bold 9px JetBrains Mono';
  ctx.textAlign = 'left';
  ctx.fillText('VERNIER I \u2014 SCALE CLOSE-UP', padding, scaleY + 4);

  // d value display
  ctx.fillStyle = 'rgba(179,136,255,0.8)';
  ctx.font = 'bold 9px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText(`d = ${state.pitch.toExponential(3)} cm  |  LC = 1/180\u00B0`, W - padding, scaleY + 4);

  // ---- MAIN SCALE ----
  const msrFloat = parseFloat(readings.msr1);
  const vsd = readings.vsd1;
  const LC = state.vernierConstant;
  const totalReading = parseFloat(readings.total1);

  // Show 5 main scale divisions centered around the reading
  const centerMSD = msrFloat; // the MSR value
  const msrStart = centerMSD - 1.5; // show 1.5° before
  const msrEnd = centerMSD + 2.0;   // show 2° after
  const msrRange = msrEnd - msrStart;
  const pixelsPerDeg = scaleW / msrRange;

  const msrY = scaleY + 30;
  const msrH = 40;

  // Main scale background
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.beginPath();
  ctx.roundRect(scaleStartX, msrY, scaleW, msrH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Main scale tick marks (every 0.5°)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let d = Math.ceil(msrStart * 2) / 2; d <= msrEnd; d += 0.5) {
    const x = scaleStartX + (d - msrStart) * pixelsPerDeg;
    if (x < scaleStartX || x > scaleStartX + scaleW) continue;

    const isWholeDeg = Math.abs(d - Math.round(d)) < 0.01;
    const tickH = isWholeDeg ? msrH * 0.7 : msrH * 0.5;

    ctx.strokeStyle = isWholeDeg ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isWholeDeg ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, msrY);
    ctx.lineTo(x, msrY + tickH);
    ctx.stroke();

    // Label
    ctx.fillStyle = isWholeDeg ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
    ctx.font = isWholeDeg ? 'bold 10px JetBrains Mono' : '8px JetBrains Mono';
    const label = d >= 0 ? d.toFixed(1) + '\u00B0' : (360 + d).toFixed(1) + '\u00B0';
    ctx.fillText(label, x, msrY + tickH + 3);
  }

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '7px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('M.S.', scaleStartX - 4, msrY + msrH / 2);

  // ---- VERNIER SCALE ----
  const vsrY = msrY + msrH + 2;
  const vsrH = 30;
  const vernierDivisions = 90; // 90 divisions for LC = 1/180°
  const vernierSpan = 0.5; // 90 VSD = 89 MSD (so vernier covers slightly less than 0.5°)
  const vernierPixelSpan = vernierSpan * pixelsPerDeg;

  // Position vernier: the zero of vernier is at the total reading position
  const vernierZeroX = scaleStartX + (totalReading - msrStart) * pixelsPerDeg;
  const vernierStartX = vernierZeroX;
  const pixelsPerVSD = vernierPixelSpan / vernierDivisions;

  // Vernier scale background
  ctx.fillStyle = 'rgba(0, 229, 255, 0.03)';
  ctx.beginPath();
  ctx.roundRect(Math.max(scaleStartX, vernierStartX - 10), vsrY, Math.min(scaleW, vernierPixelSpan + 20), vsrH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Vernier tick marks
  for (let v = 0; v <= vernierDivisions; v += 1) {
    const x = vernierStartX + v * pixelsPerVSD;
    if (x < scaleStartX - 5 || x > scaleStartX + scaleW + 5) continue;

    const isMajor = v % 10 === 0;
    const isMid = v % 5 === 0;
    const tickH = isMajor ? vsrH * 0.7 : isMid ? vsrH * 0.5 : vsrH * 0.3;
    const isCoinciding = v === vsd;

    ctx.strokeStyle = isCoinciding ? '#ff1744' :
      isMajor ? 'rgba(0, 229, 255, 0.5)' : 'rgba(0, 229, 255, 0.2)';
    ctx.lineWidth = isCoinciding ? 2.5 : isMajor ? 1.2 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, vsrY + vsrH);
    ctx.lineTo(x, vsrY + vsrH - tickH);
    ctx.stroke();

    // Coinciding line highlight
    if (isCoinciding) {
      ctx.fillStyle = '#ff1744';
      ctx.shadowColor = '#ff1744';
      ctx.shadowBlur = 6;
      // Arrow pointing up
      ctx.beginPath();
      ctx.moveTo(x, vsrY + vsrH + 2);
      ctx.lineTo(x - 4, vsrY + vsrH + 9);
      ctx.lineTo(x + 4, vsrY + vsrH + 9);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label for coinciding division
      ctx.fillStyle = '#ff1744';
      ctx.font = 'bold 8px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`VSD=${v}`, x, vsrY + vsrH + 11);
    }

    // Major labels
    if (isMajor && v <= vernierDivisions) {
      ctx.fillStyle = 'rgba(0,229,255,0.5)';
      ctx.font = '7px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${v}`, x, vsrY + vsrH - tickH - 2);
    }
  }

  // Label
  ctx.fillStyle = 'rgba(0,229,255,0.3)';
  ctx.font = '7px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('V.S.', scaleStartX - 4, vsrY + vsrH / 2);

  // ---- READING SUMMARY ----
  const summaryY = vsrY + vsrH + 24;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.roundRect(scaleStartX, summaryY, scaleW, 44, 6);
  ctx.fill();

  ctx.font = 'bold 10px JetBrains Mono';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Vernier I reading
  ctx.fillStyle = '#00e6ff';
  ctx.fillText('V\u2081:', scaleStartX + 10, summaryY + 6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`MSR = ${readings.msr1}\u00B0  +  VSD \u00D7 LC = ${vsd} \u00D7 (1/180)\u00B0 = ${readings.vsr1}\u00B0`, scaleStartX + 35, summaryY + 6);
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 11px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText(`\u03B8\u2081 = ${readings.total1}\u00B0`, scaleStartX + scaleW - 10, summaryY + 6);

  // Vernier II reading
  ctx.textAlign = 'left';
  ctx.font = 'bold 10px JetBrains Mono';
  ctx.fillStyle = '#ffab00';
  ctx.fillText('V\u2082:', scaleStartX + 10, summaryY + 24);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`MSR = ${readings.msr2}\u00B0  +  VSD \u00D7 LC = ${readings.vsd2} \u00D7 (1/180)\u00B0 = ${readings.vsr2}\u00B0`, scaleStartX + 35, summaryY + 24);
  ctx.fillStyle = '#00e676';
  ctx.font = 'bold 11px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText(`\u03B8\u2082 = ${readings.total2}\u00B0`, scaleStartX + scaleW - 10, summaryY + 24);
}

// ===== EXPERIMENT CONTROLS =====
function toggleLaser() {
  state.laserOn = !state.laserOn;
  const btn = document.getElementById('btnLaser');
  const status = document.getElementById('laserStatus');

  btn.textContent = state.laserOn ? '💡 Turn OFF Laser' : '💡 Turn ON Laser';
  btn.classList.toggle('btn-primary', !state.laserOn);
  btn.classList.toggle('btn-secondary', state.laserOn);

  status.className = `status-indicator ${state.laserOn ? 'status-on' : 'status-off'}`;
  status.innerHTML = `<span class="status-dot"></span> Laser ${state.laserOn ? 'ON' : 'OFF'}`;

  document.getElementById('btnGrating').disabled = !state.laserOn;

  drawSimulation();
  drawSpectrometer();
  updateMeasurements();
  showToast(state.laserOn ? '💡 Laser turned ON' : '🔌 Laser turned OFF');
}

function placeGrating() {
  state.gratingPlaced = !state.gratingPlaced;
  const btn = document.getElementById('btnGrating');
  const status = document.getElementById('gratingStatus');

  btn.textContent = state.gratingPlaced ? '📊 Remove Grating' : '📊 Place Grating';
  status.className = `status-indicator ${state.gratingPlaced ? 'status-on' : 'status-off'}`;
  status.innerHTML = `<span class="status-dot"></span> ${state.gratingPlaced ? 'Grating Placed' : 'No Grating'}`;

  drawSimulation();
  drawSpectrometer();
  updateMeasurements();
  showToast(state.gratingPlaced ? '📊 Grating placed on prism table' : '📊 Grating removed');
}

function moveDetector(angle) {
  state.detectorAngle = parseFloat(angle);
  document.getElementById('detectorAngleDisplay').textContent = `${angle > 0 ? '+' : ''}${parseFloat(angle).toFixed(1)}°`;

  drawSimulation();
  drawSpectrometer();
  updateMeasurements();

  // Update order buttons
  const nearestOrder = findNearestOrder(state.detectorAngle);
  document.querySelectorAll('.order-btn').forEach(btn => btn.classList.remove('active'));
  if (nearestOrder !== null) {
    const btns = document.querySelectorAll('.order-btn');
    btns.forEach(btn => {
      if ((nearestOrder === 0 && btn.textContent === '0') ||
          (nearestOrder > 0 && btn.textContent === `R${nearestOrder}`) ||
          (nearestOrder < 0 && btn.textContent === `L${Math.abs(nearestOrder)}`)) {
        btn.classList.add('active');
      }
    });
  }
}

function jumpToOrder(m) {
  if (m === 0) {
    document.getElementById('detectorSlider').value = 0;
    moveDetector(0);
    return;
  }
  const angles = getOrderAngles();
  const absM = Math.abs(m);
  if (angles[absM]) {
    const angle = m < 0 ? -angles[absM] : angles[absM];
    document.getElementById('detectorSlider').value = angle;
    moveDetector(angle);
  } else {
    showToast(`⚠️ Order ${absM} does not exist for current grating`, 'error');
  }
}

function updateGrating(lines) {
  state.linesPerCm = parseInt(lines);
  document.getElementById('linesDisplay').textContent = lines;
  document.getElementById('pitchDisplay').textContent = `${state.pitchMicrons.toFixed(3)} μm`;
  document.getElementById('obsPitch').value = `${state.pitch.toExponential(3)} cm`;
  document.getElementById('obsLines').value = lines;
  const vernierD = document.getElementById('vernierDValue');
  if (vernierD) {
    vernierD.textContent = `${state.pitch.toExponential(3)} cm`;
  }

  drawSimulation();
  initDiagramCanvas();
  drawSpectrometer();
  updateMeasurements();
}

function updateMeasurements() {
  const angle = state.detectorAngle;
  const intensity = getIntensityAtAngle(angle);
  const order = findNearestOrder(angle);

  document.getElementById('currentAngle').innerHTML = `${Math.abs(angle).toFixed(2)}<span class="m-unit">°</span>`;
  document.getElementById('detectorIntensity').innerHTML = `${intensity.toFixed(0)}<span class="m-unit">%</span>`;
  document.getElementById('currentOrder').textContent = order !== null ? (order === 0 ? '0 (central)' : `${order > 0 ? '+' : ''}${order}`) : '—';

  // Compute wavelength for current position
  if (order && order !== 0) {
    const m = Math.abs(order);
    const thetaRad = Math.abs(angle) * Math.PI / 180;
    const lambda = state.pitch * Math.sin(thetaRad) / m; // cm
    const lambdaNm = lambda * 1e7; // convert cm to nm
    document.getElementById('computedLambda').innerHTML = `${lambdaNm.toFixed(1)}<span class="m-unit">nm</span>`;
  } else {
    document.getElementById('computedLambda').innerHTML = `—<span class="m-unit">nm</span>`;
  }

  // Update vernier readings
  const readings = getVernierReadings(angle);
  document.getElementById('msr1').innerHTML = `${readings.msr1}<span class="reading-unit">°</span>`;
  document.getElementById('vsr1').innerHTML = `${readings.vsd1}<span class="reading-unit"> div</span>`;
  document.getElementById('total1').innerHTML = `${readings.total1}<span class="reading-unit">°</span>`;
  document.getElementById('total2').innerHTML = `${readings.total2}<span class="reading-unit">°</span>`;
}

// ===== RECORD READINGS =====
function recordReading() {
  if (!state.laserOn || !state.gratingPlaced) {
    showToast('⚠️ Turn on laser and place grating first!', 'error');
    return;
  }

  const order = findNearestOrder(state.detectorAngle);
  if (order === null) {
    showToast('⚠️ Move detector to a diffraction order peak!', 'error');
    return;
  }

  const angle = state.detectorAngle;
  const readings = getVernierReadings(angle);

  const absOrder = Math.abs(order);
  const side = order >= 0 ? 'r' : 'l'; // right or left
  const prefix = order === 0 ? 'c' : absOrder.toString();

  // Fill Table 1
  const msrId1 = `t1_${prefix}_${side}_v1_msr`;
  const vsrId1 = `t1_${prefix}_${side}_v1_vsr`;
  const msrId2 = `t1_${prefix}_${side}_v2_msr`;
  const vsrId2 = `t1_${prefix}_${side}_v2_vsr`;

  const el1 = document.getElementById(msrId1);
  const el2 = document.getElementById(vsrId1);
  const el3 = document.getElementById(msrId2);
  const el4 = document.getElementById(vsrId2);

  if (el1) el1.value = readings.msr1;
  if (el2) el2.value = readings.vsr1;
  if (el3) el3.value = readings.msr2;
  if (el4) el4.value = readings.vsr2;

  // For central order, fill both sides
  if (order === 0) {
    const msrIdR1 = `t1_c_r_v1_msr`;
    const vsrIdR1 = `t1_c_r_v1_vsr`;
    const msrIdR2 = `t1_c_r_v2_msr`;
    const vsrIdR2 = `t1_c_r_v2_vsr`;
    document.getElementById(msrIdR1).value = readings.msr1;
    document.getElementById(vsrIdR1).value = readings.vsr1;
    document.getElementById(msrIdR2).value = readings.msr2;
    document.getElementById(vsrIdR2).value = readings.vsr2;

    const msrIdL1 = `t1_c_l_v1_msr`;
    const vsrIdL1 = `t1_c_l_v1_vsr`;
    const msrIdL2 = `t1_c_l_v2_msr`;
    const vsrIdL2 = `t1_c_l_v2_vsr`;
    document.getElementById(msrIdL1).value = readings.msr1;
    document.getElementById(vsrIdL1).value = readings.vsr1;
    document.getElementById(msrIdL2).value = readings.msr2;
    document.getElementById(vsrIdL2).value = readings.vsr2;
  }

  // Trigger table update
  updateTable1Totals();

  const sideName = order === 0 ? 'Central' : (order > 0 ? 'Right' : 'Left');
  showToast(`📝 Recorded ${sideName} order ${absOrder} readings`);
}

// ===== TABLE CALCULATIONS =====
function setupTableListeners() {
  const inputs = document.querySelectorAll('#table1 input');
  inputs.forEach(input => {
    input.addEventListener('input', updateTable1Totals);
  });
}

function updateTable1Totals() {
  const orders = ['c', '1', '2', '3'];
  const sides = ['l', 'r'];
  const verniers = ['v1', 'v2'];

  orders.forEach(order => {
    sides.forEach(side => {
      verniers.forEach(v => {
        const msrEl = document.getElementById(`t1_${order}_${side}_${v}_msr`);
        const vsrEl = document.getElementById(`t1_${order}_${side}_${v}_vsr`);
        const totalEl = document.getElementById(`t1_${order}_${side}_${v}_total`);

        if (msrEl && vsrEl && totalEl) {
          const msr = parseFloat(msrEl.value);
          const vsr = parseFloat(vsrEl.value);
          if (!isNaN(msr) && !isNaN(vsr)) {
            totalEl.textContent = (msr + vsr).toFixed(4);
          } else {
            totalEl.textContent = '—';
          }
        }
      });
    });
  });
}

function calculateWavelength() {
  updateTable1Totals();

  const d = state.pitch; // cm
  const orders = [1, 2, 3];
  const lambdas = [];

  orders.forEach(m => {
    // Get left vernier I total (theta1')
    const lv1 = parseFloat(document.getElementById(`t1_${m}_l_v1_total`)?.textContent);
    // Get right vernier I total (theta1'')
    const rv1 = parseFloat(document.getElementById(`t1_${m}_r_v1_total`)?.textContent);
    // Get left vernier II total (theta2')
    const lv2 = parseFloat(document.getElementById(`t1_${m}_l_v2_total`)?.textContent);
    // Get right vernier II total (theta2'')
    const rv2 = parseFloat(document.getElementById(`t1_${m}_r_v2_total`)?.textContent);

    if (!isNaN(lv1) && !isNaN(rv1) && !isNaN(lv2) && !isNaN(rv2)) {
      let twoTheta1 = Math.abs(lv1 - rv1);
      if (twoTheta1 > 180) twoTheta1 = 360 - twoTheta1;
      
      let twoTheta2 = Math.abs(lv2 - rv2);
      if (twoTheta2 > 180) twoTheta2 = 360 - twoTheta2;
      
      const twoTheta = (twoTheta1 + twoTheta2) / 2;
      const theta = twoTheta / 2;
      const thetaRad = theta * Math.PI / 180;
      const lambda_cm = d * Math.sin(thetaRad) / m;
      const lambda_nm = lambda_cm * 1e7;

      // Fill Table 2
      document.getElementById(`t2_${m}_2theta1`).textContent = twoTheta1.toFixed(2);
      document.getElementById(`t2_${m}_2theta2`).textContent = twoTheta2.toFixed(2);
      document.getElementById(`t2_${m}_2theta`).textContent = twoTheta.toFixed(2);
      document.getElementById(`t2_${m}_theta`).textContent = theta.toFixed(2);
      document.getElementById(`t2_${m}_lambda_cm`).textContent = lambda_cm.toExponential(4);
      document.getElementById(`t2_${m}_lambda_nm`).textContent = lambda_nm.toFixed(1);

      // Results
      document.getElementById(`res_lambda${m}`).textContent = lambda_nm.toFixed(1);

      // Error analysis
      const vc = state.vernierConstant; // degrees
      const dTheta = 2 * vc;
      const cotTheta = 1 / Math.tan(thetaRad);
      const fracError = cotTheta * dTheta * Math.PI / 180;
      const percentError = Math.abs(fracError * 100);
      document.getElementById(`err_${m}`).textContent = percentError.toFixed(2) + '%';

      lambdas.push(lambda_nm);
    } else {
      // Clear if data missing
      ['2theta1', '2theta2', '2theta', 'theta', 'lambda_cm', 'lambda_nm'].forEach(field => {
        document.getElementById(`t2_${m}_${field}`).textContent = '—';
      });
      document.getElementById(`res_lambda${m}`).textContent = '—';
      document.getElementById(`err_${m}`).textContent = '—';
    }
  });

  // Mean wavelength
  if (lambdas.length > 0) {
    const mean = lambdas.reduce((a, b) => a + b, 0) / lambdas.length;
    document.getElementById('res_lambda_mean').textContent = mean.toFixed(1);
    showToast(`✅ Wavelength calculated! λ_mean = ${mean.toFixed(1)} nm`);
  } else {
    document.getElementById('res_lambda_mean').textContent = '—';
    showToast('⚠️ Please fill observation tables first!', 'error');
  }
}

function autoFillTable1() {
  if (!state.laserOn || !state.gratingPlaced) {
    showToast('⚠️ Turn on laser and place grating first!', 'error');
    return;
  }

  const orders = getOrderAngles();
  const centralAngle = addNoise(180, 0.01); // Reference angle

  // Central order (direct readings)
  const centralReading = addNoise(0, 0.02);
  const cr1 = getVernierReadings(centralReading);

  ['l', 'r'].forEach(side => {
    document.getElementById(`t1_c_${side}_v1_msr`).value = cr1.msr1;
    document.getElementById(`t1_c_${side}_v1_vsr`).value = cr1.vsr1;
    document.getElementById(`t1_c_${side}_v2_msr`).value = cr1.msr2;
    document.getElementById(`t1_c_${side}_v2_vsr`).value = cr1.vsr2;
  });

  // Higher orders
  [1, 2, 3].forEach(m => {
    if (orders[m]) {
      // Left side
      const leftAngle = orders[m] + addNoise(0, 0.03);
      const lr1 = getVernierReadings(leftAngle);
      document.getElementById(`t1_${m}_l_v1_msr`).value = lr1.msr1;
      document.getElementById(`t1_${m}_l_v1_vsr`).value = lr1.vsr1;
      document.getElementById(`t1_${m}_l_v2_msr`).value = lr1.msr2;
      document.getElementById(`t1_${m}_l_v2_vsr`).value = lr1.vsr2;

      // Right side
      const rightAngle = -orders[m] + addNoise(0, 0.03);
      const rr1 = getVernierReadings(rightAngle);
      document.getElementById(`t1_${m}_r_v1_msr`).value = rr1.msr1;
      document.getElementById(`t1_${m}_r_v1_vsr`).value = rr1.vsr1;
      document.getElementById(`t1_${m}_r_v2_msr`).value = rr1.msr2;
      document.getElementById(`t1_${m}_r_v2_vsr`).value = rr1.vsr2;
    }
  });

  updateTable1Totals();
  showToast('🤖 Table 1 auto-filled from simulation data!');
}

function clearTable1() {
  document.querySelectorAll('#table1 input').forEach(input => input.value = '');
  document.querySelectorAll('#table1 .computed').forEach(el => el.textContent = '—');
  showToast('🗑️ Table 1 cleared');
}

function clearTable2() {
  document.querySelectorAll('#table2 .computed').forEach(el => el.textContent = '—');
  ['res_lambda1', 'res_lambda2', 'res_lambda3', 'res_lambda_mean', 'err_1', 'err_2', 'err_3'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  showToast('🗑️ Table 2 and results cleared');
}

// ===== QUIZ =====
function selectOption(qId, optIndex) {
  quizSelected[qId] = optIndex;
  const options = document.querySelectorAll(`#${qId} .quiz-option`);
  options.forEach((opt, i) => {
    opt.classList.remove('selected', 'correct', 'incorrect');
    if (i === optIndex) opt.classList.add('selected');
  });
}

function submitQuiz() {
  let score = 0;
  const total = Object.keys(quizAnswers).length;

  Object.keys(quizAnswers).forEach(qId => {
    const correct = quizAnswers[qId];
    const selected = quizSelected[qId];
    const options = document.querySelectorAll(`#${qId} .quiz-option`);
    const feedback = document.getElementById(`${qId}-feedback`);

    options.forEach((opt, i) => {
      opt.classList.remove('selected');
      if (i === correct) opt.classList.add('correct');
      if (selected !== undefined && i === selected && i !== correct) opt.classList.add('incorrect');
    });

    if (selected === correct) {
      score++;
      feedback.className = 'quiz-feedback show correct';
      feedback.textContent = `✅ Correct! ${quizExplanations[qId]}`;
    } else if (selected !== undefined) {
      feedback.className = 'quiz-feedback show incorrect';
      feedback.textContent = `❌ Incorrect. ${quizExplanations[qId]}`;
    } else {
      feedback.className = 'quiz-feedback show incorrect';
      feedback.textContent = `⚠️ Not answered. ${quizExplanations[qId]}`;
    }
  });

  const scoreDiv = document.getElementById('quizScore');
  scoreDiv.classList.add('show');
  document.getElementById('scoreValue').textContent = `${score}/${total}`;

  showToast(`📝 Quiz submitted: ${score}/${total} correct!`);
}

function resetQuiz() {
  Object.keys(quizAnswers).forEach(qId => {
    const options = document.querySelectorAll(`#${qId} .quiz-option`);
    options.forEach(opt => opt.classList.remove('selected', 'correct', 'incorrect'));
    const feedback = document.getElementById(`${qId}-feedback`);
    feedback.className = 'quiz-feedback';
  });
  Object.keys(quizSelected).forEach(k => delete quizSelected[k]);
  document.getElementById('quizScore').classList.remove('show');
  showToast('🔄 Quiz reset');
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const msgEl = document.getElementById('toastMsg');

  msgEl.textContent = msg;
  toast.className = `toast show ${type}`;

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ===== SMOOTH SCROLL FOR INTERNAL LINKS =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ===== TOUCH CONTROLS FOR MOBILE =====
function initTouchControls() {
  const simCanvasEl = document.getElementById('simCanvas');
  if (!simCanvasEl) return;

  let isDragging = false;

  function getAngleFromTouch(e) {
    const rect = simCanvasEl.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const gratingX = W * 0.5;
    const centerY = H / 2;

    // Calculate angle from grating center to touch point
    const dx = gratingX - x;
    const dy = centerY - y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Clamp to -60..60
    angle = Math.max(-60, Math.min(60, angle));
    return angle;
  }

  // Touch start
  simCanvasEl.addEventListener('touchstart', (e) => {
    if (!state.laserOn || !state.gratingPlaced) return;
    isDragging = true;
    const angle = getAngleFromTouch(e);
    document.getElementById('detectorSlider').value = angle;
    moveDetector(angle);
    e.preventDefault();
  }, { passive: false });

  // Touch move
  simCanvasEl.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const angle = getAngleFromTouch(e);
    document.getElementById('detectorSlider').value = angle;
    moveDetector(angle);
    e.preventDefault();
  }, { passive: false });

  // Touch end
  simCanvasEl.addEventListener('touchend', () => {
    isDragging = false;
  });

  simCanvasEl.addEventListener('touchcancel', () => {
    isDragging = false;
  });

  // Mouse drag support (also useful for desktop)
  simCanvasEl.addEventListener('mousedown', (e) => {
    if (!state.laserOn || !state.gratingPlaced) return;
    isDragging = true;
    const angle = getAngleFromTouch(e);
    document.getElementById('detectorSlider').value = angle;
    moveDetector(angle);
  });

  simCanvasEl.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const angle = getAngleFromTouch(e);
    document.getElementById('detectorSlider').value = angle;
    moveDetector(angle);
  });

  simCanvasEl.addEventListener('mouseup', () => {
    isDragging = false;
  });

  simCanvasEl.addEventListener('mouseleave', () => {
    isDragging = false;
  });
}
