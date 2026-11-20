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
    
    this.stats = JSON.parse(localStorage.getItem('pottery_stats') || JSON.stringify({
      potsCreated: 0,
      potsSold: 0,
      coinsEarned: 0
    }));

    this.activeInventoryPotId = null;
    this.pendingUnlockItem = null;

    this.container = document.getElementById('canvas-container');
    this.scene = new THREE.Scene();
    
    // Camera framing: frames the pot and turntable cleanly with zero bottom overlap!
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.5, 5.0);
    this.cameraTarget = new THREE.Vector3(0, 1.05, 0);
    this.camera.lookAt(this.cameraTarget);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.potteryModel = new PotteryModel();
    this.painter = new PotteryPainter();
    this.potMesh = null;
    this.wheelGroup = new THREE.Group();
    this.scene.add(this.wheelGroup);

    this.isInteracting = false;
    this.lastPointerPos = { x: 0, y: 0 };
    this.wheelSpeed = 0.015;
    this.isFiring = false;

    this.bargainData = null;

    this.initSceneLights();
    this.initPotterWheel();
    this.initPotMesh();
    this.bindEvents();
    this.bindUI();
    this.buildStoreCatalogUI();
    this.updateCoinDisplay();
    this.updateGalleryBadge();
    this.updateProfileModalUI();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initSceneLights() {
    this.scene.background = new THREE.Color(0x121316);

    this.ambientLight = new THREE.AmbientLight(0xfff6ed, 0.95);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xfffaee, 1.5);
    this.keyLight.position.set(3.5, 6, 4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x90baff, 0.85);
    this.rimLight.position.set(-3.5, 3.5, -3);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.PointLight(0xffc599, 0.65, 10);
    this.fillLight.position.set(0, 0.9, 2.5);
    this.scene.add(this.fillLight);

    this.kilnLight = new THREE.PointLight(0xff4500, 0, 8);
    this.kilnLight.position.set(0, 1.4, 0.5);
    this.scene.add(this.kilnLight);
  }

  initPotterWheel() {
    const wheelGeo = new THREE.CylinderGeometry(1.85, 2.0, 0.22, 48);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x24262e,
      metalness: 0.55,
      roughness: 0.35
    });
    this.wheelHead = new THREE.Mesh(wheelGeo, wheelMat);
    this.wheelHead.position.y = -0.11;
    this.wheelHead.receiveShadow = true;
    this.wheelHead.castShadow = true;
    this.wheelGroup.add(this.wheelHead);

    const ringGeo = new THREE.TorusGeometry(1.35, 0.015, 16, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xa8853b, metalness: 0.85, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    this.wheelHead.add(ring);

    const tableGeo = new THREE.CylinderGeometry(5.2, 5.2, 0.5, 32);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x16171d,
      roughness: 0.85,
      metalness: 0.1
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -0.45;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  initPotMesh() {
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
    const homeEl = document.getElementById('home-coin-count');
    if (el) el.innerText = this.coins;
    if (homeEl) homeEl.innerText = this.coins;
    localStorage.setItem('pottery_coins', this.coins.toString());
  }

  updateGalleryBadge() {
    const el = document.getElementById('gallery-count-badge');
    if (el) el.innerText = this.gallery.length;
  }

  updateProfileModalUI() {
    document.getElementById('stat-pots-created').innerText = this.stats.potsCreated;
    document.getElementById('stat-pots-sold').innerText = this.stats.potsSold;
    document.getElementById('stat-in-inventory').innerText = this.gallery.length;
    document.getElementById('stat-coins-earned').innerText = this.stats.coinsEarned;

    let rank = "Apprentice Potter";
    if (this.stats.potsSold >= 15) rank = "Legendary Artisan";
    else if (this.stats.potsSold >= 8) rank = "Master Ceramist";
    else if (this.stats.potsSold >= 3) rank = "Skilled Craftsman";
    document.getElementById('profile-rank').innerText = rank;

    localStorage.setItem('pottery_stats', JSON.stringify(this.stats));
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  buildStoreCatalogUI() {
    const palCol = document.getElementById('palette-column');
    if (!palCol) return;
    palCol.innerHTML = '';

    this.painter.catalog.colors.forEach((col) => {
      const wrap = document.createElement('div');
      const isUnlocked = this.painter.isUnlocked(col.id);
      const isActive = this.painter.brushColor === col.color;
      wrap.className = `swatch-wrap ${isActive ? 'active' : ''}`;

      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = col.color;

      if (!isUnlocked) {
        const lock = document.createElement('div');
        lock.className = 'lock-badge';
        lock.innerText = '🔒';
        wrap.appendChild(lock);
      }

      wrap.appendChild(swatch);
      wrap.onclick = () => {
        if (this.painter.isUnlocked(col.id)) {
          sound.playClick();
          document.querySelectorAll('.swatch-wrap').forEach(w => w.classList.remove('active'));
          wrap.classList.add('active');
          this.painter.brushColor = col.color;
        } else {
          this.promptUnlockItem(col, 'color');
        }
      };

      palCol.appendChild(wrap);
    });

    const patCol = document.getElementById('pattern-column');
    if (!patCol) return;
    patCol.innerHTML = '';

    const toolIcons = {
      'brush': '🖌️',
      'band': '🎗️',
      'pattern_tribal': '🔶',
      'pattern_greek': '🏛️',
      'pattern_floral': '🌸',
      'pattern_gold': '👑'
    };

    this.painter.catalog.patterns.forEach((pat) => {
      const btn = document.createElement('div');
      const isUnlocked = this.painter.isUnlocked(pat.id);
      const isActive = this.painter.selectedTool === pat.id;
      btn.className = `tool-icon-btn ${isActive ? 'active' : ''}`;
      btn.innerText = toolIcons[pat.id] || '🎨';

      if (!isUnlocked) {
        const lock = document.createElement('div');
        lock.className = 'lock-badge';
        lock.innerText = '🔒';
        btn.appendChild(lock);
      }

      btn.onclick = () => {
        if (this.painter.isUnlocked(pat.id)) {
          sound.playClick();
          document.querySelectorAll('.tool-icon-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.painter.selectedTool = pat.id;
        } else {
          this.promptUnlockItem(pat, 'pattern');
        }
      };

      patCol.appendChild(btn);
    });
  }

  promptUnlockItem(item, type) {
    sound.playClick();
    this.pendingUnlockItem = item;
    const modal = document.getElementById('unlock-modal');
    document.getElementById('unlock-item-icon').innerText = type === 'color' ? '🎨' : '✨';
    document.getElementById('unlock-item-title').innerText = `Unlock ${item.name}`;
    document.getElementById('unlock-item-desc').innerText = 
      `Unlock this premium ${type} permanently for ${item.price} coins?`;
    document.getElementById('unlock-cost-text').innerText = item.price;
    modal.style.display = 'flex';
  }

  confirmUnlockItem() {
    if (!this.pendingUnlockItem) return;
    const item = this.pendingUnlockItem;
    if (this.coins < item.price) {
      sound.playClick();
      this.showToast(`⚠️ Need ${item.price} coins! Sell pottery to earn coins.`);
      document.getElementById('unlock-modal').style.display = 'none';
      return;
    }

    this.coins -= item.price;
    this.updateCoinDisplay();
    this.painter.unlockItem(item.id);
    sound.playUnlockSound();
    this.showToast(`✨ Unlocked ${item.name}!`);

    if (item.color) {
      this.painter.brushColor = item.color;
    } else {
      this.painter.selectedTool = item.id;
    }

    document.getElementById('unlock-modal').style.display = 'none';
    this.buildStoreCatalogUI();
  }

  // --- STATE TRANSITIONS ---
  setGameState(newState) {
    this.state = newState;
    sound.ensureContext();

    const elements = [
      'home-screen',
      'panel-shaping',
      'side-tray-left',
      'side-tray-right',
      'panel-kiln',
      'panel-decision',
      'panel-bargain',
      'gallery-modal',
      'profile-modal',
      'unlock-modal'
    ];
    elements.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const heightHud = document.getElementById('height-hud');
    const stageTitle = document.getElementById('stage-title');
    const kilnFx = document.getElementById('kiln-fx');

    if (kilnFx) kilnFx.classList.remove('firing');
    this.kilnLight.intensity = 0;
    this.potMesh.visible = true;

    switch (newState) {
      case STATE.HOME:
        stageTitle.innerText = "Let's Create Pottery";
        heightHud.style.display = 'none';
        document.getElementById('home-screen').style.display = 'flex';
        this.wheelSpeed = 0.008;
        sound.setWheelSound(false);
        this.activeInventoryPotId = null;
        break;

      case STATE.SHAPING:
        stageTitle.innerText = "Step 1: Shape Clay";
        heightHud.style.display = 'flex';
        document.getElementById('panel-shaping').style.display = 'flex';
        this.wheelSpeed = 0.024;
        sound.setWheelSound(true, 1.0);
        this.resetClayMaterialToRaw();
        this.updateHeightHUD();
        break;

      case STATE.DECORATING:
        stageTitle.innerText = "Step 2: Paint & Decorate";
        heightHud.style.display = 'none';
        document.getElementById('side-tray-left').style.display = 'flex';
        document.getElementById('side-tray-right').style.display = 'flex';
        this.wheelSpeed = 0.004;
        sound.setWheelSound(false);
        this.buildStoreCatalogUI();
        break;

      case STATE.KILN:
        stageTitle.innerText = "Step 3: Fire in Kiln";
        heightHud.style.display = 'none';
        document.getElementById('panel-kiln').style.display = 'block';
        document.getElementById('btn-start-firing').style.display = 'block';
        document.getElementById('btn-inspect-pot').style.display = 'none';
        document.getElementById('kiln-temp-text').innerText = "25 °C";
        document.getElementById('kiln-temp-fill').style.width = "0%";
        this.wheelSpeed = 0.015;
        sound.setWheelSound(false);
        break;

      case STATE.DECISION:
        stageTitle.innerText = "Masterpiece Appraisal";
        heightHud.style.display = 'none';
        document.getElementById('panel-decision').style.display = 'block';
        this.wheelSpeed = 0.012;
        sound.setWheelSound(false);
        this.setupDecisionCard();
        break;

      case STATE.BARGAIN:
        stageTitle.innerText = "Art Auction & Bargain";
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
    document.getElementById('appraisal-decor').innerText = `+${decorBonus} 🪙`;
    document.getElementById('predicted-price-text').innerText = `${totalPredictedPrice} Coins`;

    this.currentPotStats = {
      ...stats,
      decorBonus,
      totalPredictedPrice
    };

    const normalActions = document.getElementById('decision-normal-actions');
    const invActions = document.getElementById('decision-inventory-actions');
    if (this.activeInventoryPotId) {
      normalActions.style.display = 'none';
      invActions.style.display = 'block';
    } else {
      normalActions.style.display = 'grid';
      invActions.style.display = 'none';
    }
  }

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
    const durationMs = 3000;
    const startTime = performance.now();

    const updateKiln = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);
      const ease = 1 - Math.pow(1 - progress, 3);
      currentTemp = Math.round(25 + (targetTemp - 25) * ease);

      tempText.innerText = `${currentTemp} °C`;
      tempFill.style.width = `${progress * 100}%`;
      this.kilnLight.intensity = Math.sin(progress * Math.PI) * 4.5;

      this.clayMaterial.roughness = 0.88 - progress * 0.73;
      this.clayMaterial.metalness = 0.05 + progress * 0.15;
      this.clayMaterial.clearcoat = progress * 1.0;
      this.clayMaterial.clearcoatRoughness = 0.3 - progress * 0.22;

      if (progress < 1.0) {
        requestAnimationFrame(updateKiln);
      } else {
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

  initBargainStage() {
    const collectors = [
      { name: "Collector Hans", avatar: "🧐", title: "Antique Appraiser" },
      { name: "Madame Vivienne", avatar: "👒", title: "Luxury Curator" },
      { name: "Lord Sterling", avatar: "🎩", title: "Royal Connoisseur" },
      { name: "Master Kenji", avatar: "🎎", title: "Ceramic Master" }
    ];

    const collector = collectors[Math.floor(Math.random() * collectors.length)];
    const predicted = this.currentPotStats.totalPredictedPrice;
    const height = this.currentPotStats.heightCm;

    const initialOffer = Math.max(20, Math.round(predicted * (0.72 + Math.random() * 0.06)));

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
    document.getElementById('btn-haggle-counter').disabled = false;
    document.getElementById('btn-sweet-talk').disabled = false;

    const heightComments = height > 28 
      ? `Impressive towering height of ${height} cm! A striking piece.`
      : `Delightful proportions! A refined ${height} cm piece.`;

    document.getElementById('dealer-dialogue').innerText = 
      `"${heightComments} I can offer ${initialOffer} coins."`;
  }

  handleHaggle() {
    if (!this.bargainData) return;

    sound.playClick();
    this.bargainData.round++;
    const drop = 32 + Math.floor(Math.random() * 10);
    this.bargainData.patience = Math.max(0, this.bargainData.patience - drop);

    const pFill = document.getElementById('patience-fill');
    pFill.style.width = `${this.bargainData.patience}%`;
    document.getElementById('patience-text').innerText = `${this.bargainData.patience}%`;

    if (this.bargainData.patience <= 0) {
      this.handleBargainCrashPenalty();
      return;
    }

    if (this.bargainData.patience < 40) {
      pFill.style.backgroundColor = '#e05252';
    } else if (this.bargainData.patience < 70) {
      pFill.style.backgroundColor = '#f3b942';
    }

    const raise = Math.max(8, Math.round(this.bargainData.predicted * 0.12));
    this.bargainData.currentOffer = Math.min(
      Math.round(this.bargainData.predicted * 1.25),
      this.bargainData.currentOffer + raise
    );

    document.getElementById('deal-offer-amount').innerText = this.bargainData.currentOffer;
    document.getElementById('dealer-dialogue').innerText = 
      `"You drive a tough bargain! How about ${this.bargainData.currentOffer} coins?"`;
  }

  handleSweetTalk() {
    if (!this.bargainData) return;
    sound.playClick();

    const drop = 18;
    this.bargainData.patience = Math.max(0, this.bargainData.patience - drop);

    if (this.bargainData.patience <= 0) {
      this.handleBargainCrashPenalty();
      return;
    }

    const bump = Math.max(5, Math.round(this.bargainData.predicted * 0.07));
    this.bargainData.currentOffer += bump;

    const pFill = document.getElementById('patience-fill');
    pFill.style.width = `${this.bargainData.patience}%`;
    document.getElementById('patience-text').innerText = `${this.bargainData.patience}%`;
    document.getElementById('deal-offer-amount').innerText = this.bargainData.currentOffer;

    document.getElementById('dealer-dialogue').innerText = 
      `"You speak with true passion for your craft! I can bid ${this.bargainData.currentOffer} coins."`;
  }

  handleBargainCrashPenalty() {
    sound.playShatterSound();

    const shatter = document.getElementById('shatter-fx');
    shatter.classList.add('show');
    this.potMesh.visible = false;

    const penalty = 10;
    this.coins = Math.max(0, this.coins - penalty);
    this.updateCoinDisplay();

    if (this.activeInventoryPotId) {
      this.gallery = this.gallery.filter(p => p.id !== this.activeInventoryPotId);
      localStorage.setItem('pottery_gallery', JSON.stringify(this.gallery));
      this.updateGalleryBadge();
      this.activeInventoryPotId = null;
    }

    document.getElementById('dealer-dialogue').innerText = 
      `"OUTRAGEOUS! The collector slammed the table in fury—your pottery shattered! (-10 🪙 Penalty)"`;

    document.getElementById('btn-haggle-counter').disabled = true;
    document.getElementById('btn-sweet-talk').disabled = true;
    document.getElementById('btn-accept-deal').disabled = true;

    this.showToast("💥 Pot shattered! You were fined 10 coins.");

    setTimeout(() => {
      shatter.classList.remove('show');
      this.setGameState(STATE.HOME);
    }, 2200);
  }

  handleAcceptDeal() {
    if (!this.bargainData) return;
    const earned = this.bargainData.currentOffer;
    this.coins += earned;
    this.stats.potsSold++;
    this.stats.coinsEarned += earned;
    this.updateCoinDisplay();
    this.updateProfileModalUI();

    sound.playGavelSound();
    setTimeout(() => sound.playCoinsSound(), 200);

    if (this.activeInventoryPotId) {
      this.gallery = this.gallery.filter(p => p.id !== this.activeInventoryPotId);
      localStorage.setItem('pottery_gallery', JSON.stringify(this.gallery));
      this.updateGalleryBadge();
      this.activeInventoryPotId = null;
    }

    this.showToast(`🎉 Sold for ${earned} Coins!`);
    setTimeout(() => {
      this.setGameState(STATE.HOME);
    }, 1200);
  }

  handleKeepPot() {
    const keepCost = 10;
    if (this.coins < keepCost) {
      sound.playClick();
      this.showToast("⚠️ Need 10 Coins to preserve in Gallery! Sell pottery to earn coins.");
      return;
    }

    this.coins -= keepCost;
    this.updateCoinDisplay();
    sound.playCoinsSound();

    this.renderer.render(this.scene, this.camera);
    const thumbData = this.renderer.domElement.toDataURL('image/jpeg', 0.6);
    const textureData = this.painter.toDataURL();

    const potRecord = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      styleName: this.currentPotStats.styleName,
      heightCm: this.currentPotStats.heightCm,
      price: this.currentPotStats.totalPredictedPrice,
      thumb: thumbData,
      meshData: this.potteryModel.exportData(),
      textureData: textureData
    };

    this.gallery.unshift(potRecord);
    localStorage.setItem('pottery_gallery', JSON.stringify(this.gallery));
    this.updateGalleryBadge();
    this.updateProfileModalUI();

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
          <p style="font-size: 13px; margin-top: 4px;">Save your pottery for 10 coins to exhibit them here!</p>
        </div>
      `;
      return;
    }

    this.gallery.forEach((pot) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `
        <img class="gallery-thumb" src="${pot.thumb}" alt="${pot.styleName}" />
        <div style="width: 100%; text-align: left;">
          <div style="font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pot.styleName}</div>
          <div style="font-size: 11px; color: var(--text-sub); display: flex; justify-content: space-between; margin-top: 2px;">
            <span>${pot.heightCm} cm</span>
            <span style="color: var(--gold); font-weight: 700;">${pot.price} 🪙</span>
          </div>
        </div>
      `;

      item.onclick = () => {
        this.potteryModel.importData(pot.meshData);
        if (pot.textureData) {
          this.painter.loadFromDataURL(pot.textureData);
        }

        this.clayMaterial.roughness = 0.15;
        this.clayMaterial.metalness = 0.2;
        this.clayMaterial.clearcoat = 1.0;

        this.currentPotStats = {
          styleName: pot.styleName,
          heightCm: pot.heightCm,
          totalPredictedPrice: pot.price
        };

        this.activeInventoryPotId = pot.id;
        document.getElementById('gallery-modal').style.display = 'none';
        this.setGameState(STATE.DECISION);
      };

      grid.appendChild(item);
    });
  }

  // --- UI BINDINGS ---
  bindUI() {
    document.getElementById('btn-sound').onclick = (e) => {
      const enabled = sound.toggleMute();
      e.currentTarget.innerText = enabled ? '🔊' : '🔇';
    };

    document.getElementById('btn-home').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.HOME);
    };

    const openProfile = () => {
      sound.playClick();
      this.updateProfileModalUI();
      document.getElementById('profile-modal').style.display = 'flex';
    };
    document.getElementById('btn-open-profile').onclick = openProfile;
    document.getElementById('btn-home-profile').onclick = openProfile;
    document.getElementById('btn-close-profile').onclick = () => {
      sound.playClick();
      document.getElementById('profile-modal').style.display = 'none';
    };

    document.getElementById('btn-cancel-unlock').onclick = () => {
      sound.playClick();
      document.getElementById('unlock-modal').style.display = 'none';
      this.pendingUnlockItem = null;
    };
    document.getElementById('btn-confirm-unlock').onclick = () => {
      this.confirmUnlockItem();
    };

    document.getElementById('btn-start-new-pot').onclick = () => {
      sound.playClick();
      this.stats.potsCreated++;
      this.updateProfileModalUI();
      this.activeInventoryPotId = null;
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

    // Stage 1: Right-Side Shaping Buttons
    document.getElementById('btn-mini-smooth').onclick = () => {
      sound.playClayTouch(0.6);
      this.potteryModel.smoothProfile();
      this.updateHeightHUD();
    };
    document.getElementById('btn-mini-reset').onclick = () => {
      sound.playClick();
      this.potteryModel.reset();
      this.updateHeightHUD();
    };
    document.getElementById('btn-mini-finish').onclick = () => {
      sound.playClick();
      this.setGameState(STATE.DECORATING);
    };

    // Stage 2: Side Painting Trays
    const sideLeft = document.getElementById('side-tray-left');
    const sideRight = document.getElementById('side-tray-right');

    document.getElementById('btn-toggle-colors').onclick = (e) => {
      sound.playClick();
      sideLeft.classList.toggle('minimized');
      e.currentTarget.innerText = sideLeft.classList.contains('minimized') ? '▶' : '◀';
    };

    document.getElementById('btn-toggle-tools').onclick = (e) => {
      sound.playClick();
      sideRight.classList.toggle('minimized');
      e.currentTarget.innerText = sideRight.classList.contains('minimized') ? '◀' : '▶';
    };

    document.getElementById('btn-paint-undo').onclick = () => {
      sound.playClick();
      this.painter.undo();
    };

    document.getElementById('btn-paint-finish').onclick = () => {
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

    document.getElementById('btn-sell-from-gallery').onclick = () => {
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

  handleShapingPointer(coords, deltaX, deltaY) {
    this.pointer.x = coords.x;
    this.pointer.y = coords.y;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObject(this.potMesh, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitPoint = hit.point;
      const normalizedY = Math.max(0, Math.min(1.0, hitPoint.y / this.potteryModel.height));

      if (normalizedY > 0.82 && Math.abs(deltaY) > Math.abs(deltaX)) {
        const heightDelta = -deltaY * 0.007;
        this.potteryModel.adjustHeight(heightDelta);
        this.updateHeightHUD();
        sound.playClayTouch(0.3);
      } else {
        const deltaRadius = deltaX * 0.0075;
        this.potteryModel.deformRadius(normalizedY, deltaRadius);
        this.updateHeightHUD();
        sound.playClayTouch(Math.min(1.0, Math.abs(deltaX) * 0.15));
      }
    }
  }

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
          if (isStart) {
            this.painter.applyCircumferenceBand(uv.y, tool);
            sound.playBrushStroke();
          }
        }
      }
    } else {
      const deltaX = coords.clientX - this.lastPointerPos.clientX;
      this.wheelGroup.rotation.y += deltaX * 0.008;
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (!this.isInteracting || this.state === STATE.SHAPING || this.state === STATE.KILN) {
      this.wheelGroup.rotation.y += this.wheelSpeed;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PotteryGame();
});
