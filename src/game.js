import * as THREE from 'three';
import { PotteryModel } from './potteryMesh.js';
import { PotteryPainter } from './potteryPainter.js';
import { sound } from './audio.js';

// Game States
const STATE = {
  HOME: 'HOME',
  SHAPING: 'SHAPING',
  DECORATING: 'DECORATING',
  KILN: 'KILN',
  DECISION: 'DECISION',
  BARGAIN: 'BARGAIN',
  GALLERY: 'GALLERY'
};

class PotteryGame {
  constructor() {
    this.state = STATE.HOME;
    this.coins = parseInt(localStorage.getItem('pottery_coins') || '100', 10);
    this.gallery = JSON.parse(localStorage.getItem('pottery_gallery') || '[]');

    // Setup Three.js
    this.container = document.getElementById('canvas-container');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Camera setup
    this.camera.position.set(0, 2.2, 5.2);
    this.cameraTarget = new THREE.Vector3(0, 1.2, 0);
    this.camera.lookAt(this.cameraTarget);

    // Raycaster for touch/click interaction
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Models & Painter
    this.potteryModel = new PotteryModel();
    this.painter = new PotteryPainter();
    this.potMesh = null;
    this.wheelGroup = new THREE.Group();
    this.scene.add(this.wheelGroup);

    // Interaction flags
    this.isInteracting = false;
    this.lastPointerPos = { x: 0, y: 0 };
    this.wheelSpeed = 0.02;
    this.isFiring = false;

    // Bargaining state
    this.bargainData = null;

    // Palette Colors
    this.paletteColors = [
      '#2b4c7e', // Cobalt Blue
      '#1b6b50', // Jade Emerald
      '#a83232', // Terracotta Crimson
      '#e5a93c', // Imperial Gold
      '#2c2d30', // Charcoal Obsidian
      '#f4f1ea', // Ivory Porcelain
      '#8f53a1', // Royal Amethyst
      '#c27c3f'  // Raw Clay
    ];

    this.initSceneLights();
    this.initPotterWheel();
    this.initPotMesh();
    this.bindEvents();
    this.bindUI();
    this.updateCoinDisplay();
    this.updateGalleryBadge();

    // Start render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initSceneLights() {
    this.scene.background = new THREE.Color(0x131418);

    // Studio Ambient Light
    this.ambientLight = new THREE.AmbientLight(0xfff5ea, 0.9);
    this.scene.add(this.ambientLight);

    // Key Light (Main soft shadow)
    this.keyLight = new THREE.DirectionalLight(0xfff8ee, 1.4);
    this.keyLight.position.set(4, 6, 4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.scene.add(this.keyLight);

    // Rim light from behind for silhouette definition
    this.rimLight = new THREE.DirectionalLight(0xa6c8ff, 0.8);
    this.rimLight.position.set(-4, 3, -3);
    this.scene.add(this.rimLight);

    // Soft warm fill light
    this.fillLight = new THREE.PointLight(0xffcaa0, 0.6, 10);
    this.fillLight.position.set(0, 0.8, 2.5);
    this.scene.add(this.fillLight);

    // Kiln fiery glow light (normally 0 intensity)
    this.kilnLight = new THREE.PointLight(0xff4500, 0, 8);
    this.kilnLight.position.set(0, 1.5, 0.5);
    this.scene.add(this.kilnLight);
  }

  initPotterWheel() {
    // Wheel Head Turntable
    const wheelGeo = new THREE.CylinderGeometry(1.9, 2.05, 0.25, 48);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x22242b,
      metalness: 0.6,
      roughness: 0.35
    });
    this.wheelHead = new THREE.Mesh(wheelGeo, wheelMat);
    this.wheelHead.position.y = -0.125;
    this.wheelHead.receiveShadow = true;
    this.wheelHead.castShadow = true;
    this.wheelGroup.add(this.wheelHead);

    // Concentric brass rings on wheel
    const ringGeo = new THREE.TorusGeometry(1.4, 0.015, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x997a3a, metalness: 0.8, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    this.wheelHead.add(ring);

    // Studio Table Surface
    const tableGeo = new THREE.CylinderGeometry(5.5, 5.5, 0.5, 32);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x18191f,
      roughness: 0.85,
      metalness: 0.1
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -0.5;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  initPotMesh() {
    // Ceramic material with dynamic painter canvas texture
    this.clayMaterial = new THREE.MeshPhysicalMaterial({
      map: this.painter.texture,
      roughness: 0.88,
      metalness: 0.05,
      clearcoat: 0.0,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide
    });

    this.potMesh = this.potteryModel.createMesh(this.clayMaterial);
    this.potMesh.position.y = 0;
    this.wheelGroup.add(this.potMesh);
  }

  updateCoinDisplay() {
    const el = document.getElementById('coin-count');
    if (el) el.innerText = this.coins;
    localStorage.setItem('pottery_coins', this.coins.toString());
  }

  updateGalleryBadge() {
    const el = document.getElementById('gallery-count-badge');
    if (el) el.innerText = this.gallery.length;
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // State Transition Machine
  setGameState(newState) {
    this.state = newState;
    sound.ensureContext();

    // Hide all state panels
    const panels = [
      'home-screen',
      'panel-shaping',
      'panel-decorating',
      'panel-kiln',
      'panel-decision',
      'panel-bargain',
      'gallery-modal'
    ];
    panels.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const heightHud = document.getElementById('height-hud');
    const stageTitle = document.getElementById('stage-title');
    const kilnFx = document.getElementById('kiln-fx');

    if (kilnFx) kilnFx.classList.remove('firing');
    this.kilnLight.intensity = 0;

    switch (newState) {
      case STATE.HOME:
        stageTitle.innerText = "Let's Create Pottery";
        heightHud.style.display = 'none';
        document.getElementById('home-screen').style.display = 'flex';
        this.wheelSpeed = 0.008;
        sound.setWheelSound(false);
        break;

      case STATE.SHAPING:
        stageTitle.innerText = "Step 1: Shape Clay";
        heightHud.style.display = 'flex';
        document.getElementById('panel-shaping').style.display = 'flex';
        this.wheelSpeed = 0.025;
        sound.setWheelSound(true, 1.0);
        this.resetClayMaterialToRaw();
        this.updateHeightHUD();
        break;

      case STATE.DECORATING:
        stageTitle.innerText = "Step 2: Paint & Decorate";
        heightHud.style.display = 'none';
        document.getElementById('panel-decorating').style.display = 'flex';
        this.wheelSpeed = 0.005;
        sound.setWheelSound(false);
        break;

      case STATE.KILN:
        stageTitle.innerText = "Step 3: Fire in Kiln";
        heightHud.style.display = 'none';
        document.getElementById('panel-kiln').style.display = 'flex';
        document.getElementById('btn-start-firing').style.display = 'block';
        document.getElementById('btn-inspect-pot').style.display = 'none';
        document.getElementById('kiln-temp-text').innerText = "25 °C";
        document.getElementById('kiln-temp-fill').style.width = "0%";
        this.wheelSpeed = 0.015;
        sound.setWheelSound(false);
        break;

      case STATE.DECISION:
        stageTitle.innerText = "Step 4: Keep or Sell";
        heightHud.style.display = 'none';
        document.getElementById('panel-decision').style.display = 'flex';
        this.wheelSpeed = 0.012;
        sound.setWheelSound(false);
        this.setupDecisionCard();
        break;

      case STATE.BARGAIN:
        stageTitle.innerText = "Auction & Bargain";
        heightHud.style.display = 'none';
        document.getElementById('panel-bargain').style.display = 'block';
        this.wheelSpeed = 0.012;
        sound.setWheelSound(false);
        this.initBargainStage();
        break;

      case STATE.GALLERY:
        document.getElementById('gallery-modal').style.display = 'flex';
        this.renderGalleryModal();
        break;
    }
  }

  resetClayMaterialToRaw() {
    this.clayMaterial.roughness = 0.88;
    this.clayMaterial.metalness = 0.05;
    this.clayMaterial.clearcoat = 0.0;
  }

  updateHeightHUD() {
    const valEl = document.getElementById('height-val');
    if (valEl) {
      valEl.innerText = `${this.potteryModel.getHeightCm()} cm`;
    }
  }

  setupDecisionCard() {
    const stats = this.potteryModel.evaluatePotStats();
    const decorBonus = this.painter.getDecorationBonus();
    const totalPredictedPrice = stats.basePrice + decorBonus;

    document.getElementById('appraisal-style-name').innerText = stats.styleName;
    document.getElementById('appraisal-height').innerText = `${stats.heightCm} cm`;
    document.getElementById('appraisal-decor').innerText = `+${decorBonus} Coins`;
    document.getElementById('predicted-price-text').innerText = `${totalPredictedPrice} Coins`;

    this.currentPotStats = {
      ...stats,
      decorBonus,
      totalPredictedPrice
    };
  }

  // --- STAGE 3: KILN FIRING ANIMATION ---
  startKilnFiring() {
    if (this.isFiring) return;
    this.isFiring = true;

    sound.startKilnSound();
    const kilnFx = document.getElementById('kiln-fx');
    if (kilnFx) kilnFx.classList.add('firing');

    const tempText = document.getElementById('kiln-temp-text');
    const tempFill = document.getElementById('kiln-temp-fill');
    const startBtn = document.getElementById('btn-start-firing');
    const inspectBtn = document.getElementById('btn-inspect-pot');

    startBtn.style.display = 'none';

    let currentTemp = 25;
    const targetTemp = 1250;
    const durationMs = 3200;
    const startTime = performance.now();

    const updateKiln = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      // Smooth cubic curve for temperature ramp
      const ease = 1 - Math.pow(1 - progress, 3);
      currentTemp = Math.round(25 + (targetTemp - 25) * ease);

      tempText.innerText = `${currentTemp} °C`;
      tempFill.style.width = `${progress * 100}%`;

      // Glow light intensity
      this.kilnLight.intensity = Math.sin(progress * Math.PI) * 4.5;

      // Metamorphosis: clay becomes smooth, hardened, high-gloss glazed ceramic!
      this.clayMaterial.roughness = 0.88 - progress * 0.73; // 0.88 -> 0.15
      this.clayMaterial.metalness = 0.05 + progress * 0.15; // 0.05 -> 0.20
      this.clayMaterial.clearcoat = progress * 1.0;         // 0.0 -> 1.0
      this.clayMaterial.clearcoatRoughness = 0.3 - progress * 0.22;

      if (progress < 1.0) {
        requestAnimationFrame(updateKiln);
      } else {
        // Firing finished!
        this.isFiring = false;
        sound.stopKilnSound();
        sound.playCeramicPing();
        if (kilnFx) kilnFx.classList.remove('firing');
        this.kilnLight.intensity = 0;
        inspectBtn.style.display = 'block';
        this.showToast("🔥 Pottery Fired to Perfection!");
      }
    };

    requestAnimationFrame(updateKiln);
  }

  // --- STAGE 5: BARGAIN & SELLING MINI-GAME ---
  initBargainStage() {
    const collectors = [
      { name: "Collector Hans", avatar: "🧐", title: "Antique Connoisseur", mood: "analytical" },
      { name: "Madame Vivienne", avatar: "👒", title: "Luxury Gallery Owner", mood: "refined" },
      { name: "Lord Sterling", avatar: "🎩", title: "Royal Ceramic Enthusiast", mood: "demanding" },
      { name: "Curator Kenji", avatar: "🎎", title: "Museum Appraiser", mood: "zen" }
    ];

    const collector = collectors[Math.floor(Math.random() * collectors.length)];
    const predicted = this.currentPotStats.totalPredictedPrice;
    const height = this.currentPotStats.heightCm;

    // Opening offer (70% - 75% of predicted value)
    const initialOffer = Math.max(20, Math.round(predicted * (0.7 + Math.random() * 0.08)));

    this.bargainData = {
      collector,
      predicted,
      currentOffer: initialOffer,
      patience: 100,
      round: 0
    };

    document.getElementById('dealer-avatar').innerText = collector.avatar;
    document.getElementById('dealer-name').innerText = collector.name;
    document.getElementById('deal-offer-amount').innerText = initialOffer;
    document.getElementById('patience-text').innerText = '100%';
    document.getElementById('patience-fill').style.width = '100%';
    document.getElementById('patience-fill').style.backgroundColor = '#38b000';

    // Dialogue influenced by height (as requested by user)
    const heightComments = height > 32 
      ? `Impressive towering height of ${height} cm! A magnificent sculpture.`
      : `Delightful proportions! A charming ${height} cm piece.`;

    document.getElementById('dealer-dialogue').innerText = 
      `"${heightComments} My initial offer is ${initialOffer} coins."`;
  }

  handleHaggle() {
    if (!this.bargainData || this.bargainData.patience <= 0) return;

    sound.playClick();
    this.bargainData.round++;
    const drop = 28 + Math.floor(Math.random() * 12);
    this.bargainData.patience = Math.max(0, this.bargainData.patience - drop);

    // Update patience bar
    const pFill = document.getElementById('patience-fill');
    pFill.style.width = `${this.bargainData.patience}%`;
    document.getElementById('patience-text').innerText = `${this.bargainData.patience}%`;

    if (this.bargainData.patience < 35) {
      pFill.style.backgroundColor = '#e05252';
    } else if (this.bargainData.patience < 65) {
      pFill.style.backgroundColor = '#f3b942';
    }

    // Raise offer
    if (this.bargainData.patience > 0) {
      const raise = Math.max(8, Math.round(this.bargainData.predicted * 0.12));
      this.bargainData.currentOffer = Math.min(
        Math.round(this.bargainData.predicted * 1.25),
        this.bargainData.currentOffer + raise
      );

      document.getElementById('deal-offer-amount').innerText = this.bargainData.currentOffer;
      document.getElementById('dealer-dialogue').innerText = 
        `"You drive a tough bargain! Very well, how about ${this.bargainData.currentOffer} coins?"`;
    } else {
      // Out of patience! Final offer or slight penalty
      document.getElementById('dealer-dialogue').innerText = 
        `"That's my absolute limit! Take ${this.bargainData.currentOffer} coins or I must walk away."`;
      document.getElementById('btn-haggle-counter').disabled = true;
      document.getElementById('btn-sweet-talk').disabled = true;
    }
  }

  handleSweetTalk() {
    if (!this.bargainData || this.bargainData.patience <= 0) return;
    sound.playClick();

    // Compliment craft restores some patience or increases bonus
    const bump = Math.max(5, Math.round(this.bargainData.predicted * 0.07));
    this.bargainData.currentOffer += bump;
    this.bargainData.patience = Math.max(10, this.bargainData.patience - 15);

    const pFill = document.getElementById('patience-fill');
    pFill.style.width = `${this.bargainData.patience}%`;
    document.getElementById('patience-text').innerText = `${this.bargainData.patience}%`;
    document.getElementById('deal-offer-amount').innerText = this.bargainData.currentOffer;

    document.getElementById('dealer-dialogue').innerText = 
      `"You speak with true passion for your craft! I can raise my bid to ${this.bargainData.currentOffer} coins."`;
  }

  handleAcceptDeal() {
    if (!this.bargainData) return;
    const earned = this.bargainData.currentOffer;
    this.coins += earned;
    this.updateCoinDisplay();

    sound.playGavelSound();
    setTimeout(() => sound.playCoinsSound(), 200);

    this.showToast(`🎉 Sold for ${earned} Coins!`);
    setTimeout(() => {
      this.setGameState(STATE.HOME);
    }, 1200);
  }

  // --- STAGE 4: KEEP DECISION ---
  handleKeepPot() {
    // Keep option charges 10 in-game coins as requested by user
    const keepCost = 10;
    if (this.coins < keepCost) {
      sound.playClick();
      this.showToast("⚠️ Need 10 Coins to preserve in Gallery! Sell pottery to earn coins.");
      return;
    }

    this.coins -= keepCost;
    this.updateCoinDisplay();
    sound.playCoinsSound();

    // Render snapshot
    this.renderer.render(this.scene, this.camera);
    const thumbData = this.renderer.domElement.toDataURL('image/jpeg', 0.6);

    const potRecord = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      styleName: this.currentPotStats.styleName,
      heightCm: this.currentPotStats.heightCm,
      price: this.currentPotStats.totalPredictedPrice,
      thumb: thumbData,
      meshData: this.potteryModel.exportData()
    };

    this.gallery.unshift(potRecord);
    localStorage.setItem('pottery_gallery', JSON.stringify(this.gallery));
    this.updateGalleryBadge();

    this.showToast("📦 Pot Saved to Gallery! (-10 🪙)");
    setTimeout(() => {
      this.setGameState(STATE.HOME);
    }, 1100);
  }

  renderGalleryModal() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (this.gallery.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-sub); padding: 50px 20px;">
          <p style="font-size: 32px; margin-bottom: 8px;">🏺</p>
          <p>Your Gallery is currently empty.</p>
          <p style="font-size: 13px; margin-top: 4px;">Create and keep pots for 10 coins to display them here!</p>
        </div>
      `;
      return;
    }

    this.gallery.forEach((pot, idx) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `
        <img class="gallery-thumb" src="${pot.thumb}" alt="${pot.styleName}" />
        <div style="width: 100%; text-align: left;">
          <div style="font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pot.styleName}</div>
          <div style="font-size: 11px; color: var(--text-sub); display: flex; justify-content: space-between; margin-top: 3px;">
            <span>${pot.heightCm} cm</span>
            <span style="color: var(--gold); font-weight: 600;">${pot.price} 🪙</span>
          </div>
        </div>
      `;

      item.onclick = () => {
        // Load pot into 3D view
        this.potteryModel.importData(pot.meshData);
        this.currentPotStats = {
          styleName: pot.styleName,
          heightCm: pot.heightCm,
          totalPredictedPrice: pot.price
        };
        document.getElementById('gallery-modal').style.display = 'none';
        this.setGameState(STATE.DECISION);
      };

      grid.appendChild(item);
    });
  }

  // --- UI & TOUCH EVENT BINDINGS ---
  bindUI() {
    // Top Bar
    document.getElementById('btn-sound').onclick = (e) => {
      const enabled = sound.toggleMute();
      e.currentTarget.innerText = enabled ? '🔊' : '🔇';
    };

    document.getElementById('btn-home').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.HOME);
    };

    // Home Screen
    document.getElementById('btn-start-new-pot').onclick = () => {
      sound.playClick();
      this.potteryModel.reset();
      this.painter.initBaseClay();
      this.setGameState(STATE.SHAPING);
    };

    document.getElementById('btn-open-gallery').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.GALLERY);
    };

    document.getElementById('btn-close-gallery').onclick = () => {
      sound.playClick();
      document.getElementById('gallery-modal').style.display = 'none';
      if (this.state === STATE.GALLERY) {
        this.setGameState(STATE.HOME);
      }
    };

    // Stage 1: Shaping
    document.getElementById('btn-smooth-clay').onclick = () => {
      sound.playClayTouch(0.6);
      this.potteryModel.smoothProfile();
      this.updateHeightHUD();
    };

    document.getElementById('btn-reset-clay').onclick = () => {
      sound.playClick();
      this.potteryModel.reset();
      this.updateHeightHUD();
    };

    document.getElementById('btn-finish-shape').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.DECORATING);
    };

    // Stage 2: Painting & Decorating
    const paletteRow = document.getElementById('palette-row');
    this.paletteColors.forEach((color, i) => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch ${i === 0 ? 'active' : ''}`;
      swatch.style.backgroundColor = color;
      swatch.onclick = () => {
        sound.playClick();
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.painter.brushColor = color;
      };
      paletteRow.appendChild(swatch);
    });

    document.querySelectorAll('#pattern-tools-row .tool-chip').forEach(chip => {
      chip.onclick = () => {
        sound.playClick();
        document.querySelectorAll('#pattern-tools-row .tool-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.painter.selectedTool = chip.dataset.tool;
      };
    });

    const brushSlider = document.getElementById('brush-size-slider');
    brushSlider.oninput = (e) => {
      this.painter.brushSize = parseInt(e.target.value, 10);
    };

    document.getElementById('btn-undo-paint').onclick = () => {
      sound.playClick();
      this.painter.undo();
    };

    document.getElementById('btn-finish-decorating').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.KILN);
    };

    // Stage 3: Kiln
    document.getElementById('btn-start-firing').onclick = () => {
      this.startKilnFiring();
    };

    document.getElementById('btn-inspect-pot').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.DECISION);
    };

    // Stage 4: Decision
    document.getElementById('btn-keep-pot').onclick = () => {
      this.handleKeepPot();
    };

    document.getElementById('btn-sell-auction').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.BARGAIN);
    };

    // Stage 5: Bargaining
    document.getElementById('btn-haggle-counter').onclick = () => {
      this.handleHaggle();
    };

    document.getElementById('btn-sweet-talk').onclick = () => {
      this.handleSweetTalk();
    };

    document.getElementById('btn-accept-deal').onclick = () => {
      this.handleAcceptDeal();
    };
  }

  // --- TOUCH & POINTER HANDLING ---
  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const dom = this.renderer.domElement;

    // Pointer events (works for touch, pen, mouse uniformly)
    dom.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
  }

  getPointerCoords(e) {
    return {
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -(e.clientY / window.innerHeight) * 2 + 1,
      clientX: e.clientX,
      clientY: e.clientY
    };
  }

  onPointerDown(e) {
    if (this.state !== STATE.SHAPING && this.state !== STATE.DECORATING && this.state !== STATE.DECISION) {
      return;
    }

    sound.ensureContext();
    this.isInteracting = true;
    const coords = this.getPointerCoords(e);
    this.lastPointerPos = coords;

    if (this.state === STATE.DECORATING) {
      this.handleDecoratingPointer(coords, true);
    }
  }

  onPointerMove(e) {
    if (!this.isInteracting) return;
    const coords = this.getPointerCoords(e);
    const deltaX = coords.clientX - this.lastPointerPos.clientX;
    const deltaY = coords.clientY - this.lastPointerPos.clientY;

    if (this.state === STATE.SHAPING) {
      this.handleShapingPointer(coords, deltaX, deltaY);
    } else if (this.state === STATE.DECORATING) {
      this.handleDecoratingPointer(coords, false);
    } else if (this.state === STATE.DECISION || this.state === STATE.HOME) {
      // Rotate showcase view
      this.wheelGroup.rotation.y += deltaX * 0.01;
    }

    this.lastPointerPos = coords;
  }

  onPointerUp(e) {
    this.isInteracting = false;
    if (this.state === STATE.DECORATING) {
      this.painter.endStroke();
    }
  }

  // Interactive clay stretching & pinching
  handleShapingPointer(coords, deltaX, deltaY) {
    this.pointer.x = coords.x;
    this.pointer.y = coords.y;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObject(this.potMesh, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitPoint = hit.point;
      const normalizedY = Math.max(0, Math.min(1.0, hitPoint.y / this.potteryModel.height));

      // If near the top rim, allow pulling/pushing height vertically
      if (normalizedY > 0.85 && Math.abs(deltaY) > Math.abs(deltaX)) {
        const heightDelta = -deltaY * 0.007; // drag up to stretch taller, down to compress
        this.potteryModel.adjustHeight(heightDelta);
        this.updateHeightHUD();
        sound.playClayTouch(0.3);
      } else {
        // Drag horizontally across clay:
        // Dragging outward (away from center) widens; inward narrows/pinches
        const deltaRadius = deltaX * 0.0075;
        this.potteryModel.deformRadius(normalizedY, deltaRadius);
        this.updateHeightHUD();
        sound.playClayTouch(Math.min(1.0, Math.abs(deltaX) * 0.15));
      }
    }
  }

  // Interactive painting on the pot
  handleDecoratingPointer(coords, isStart) {
    this.pointer.x = coords.x;
    this.pointer.y = coords.y;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObject(this.potMesh, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const uv = hit.uv;

      if (uv) {
        const tool = this.painter.selectedTool;
        if (tool === 'brush') {
          this.painter.paintAtUV(uv.x, uv.y, isStart);
          sound.playBrushStroke();
        } else {
          // Band / Ornamental pattern stamp around circumference
          if (isStart) {
            this.painter.applyCircumferenceBand(uv.y, tool);
            sound.playBrushStroke();
          }
        }
      }
    } else {
      // Swiping outside the pot rotates the wheel for easy painting from all angles
      const deltaX = coords.clientX - this.lastPointerPos.clientX;
      this.wheelGroup.rotation.y += deltaX * 0.008;
    }
  }

  // Main Render Loop
  animate() {
    requestAnimationFrame(this.animate);

    // Continuous turntable spin
    if (!this.isInteracting || this.state === STATE.SHAPING || this.state === STATE.KILN) {
      this.wheelGroup.rotation.y += this.wheelSpeed;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// Boot game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new PotteryGame();
});
