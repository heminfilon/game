import * as THREE from 'three';

export class PotteryPainter {
  constructor() {
    this.width = 1024;
    this.height = 512;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    // Painting state
    this.brushColor = '#2b4c7e'; // Cobalt blue (Free)
    this.brushSize = 18;
    this.selectedTool = 'brush'; // 'brush' (Free)
    this.glazeTone = '#d49b6a';

    this.history = [];
    this.maxHistory = 10;
    this.paintedStrokesCount = 0;

    // Item Store catalog with coin prices
    this.catalog = {
      colors: [
        { id: 'col_cobalt', color: '#2b4c7e', name: 'Cobalt Blue', price: 0 },
        { id: 'col_clay', color: '#c27c3f', name: 'Raw Terracotta', price: 0 },
        { id: 'col_crimson', color: '#a83232', name: 'Crimson Clay', price: 20 },
        { id: 'col_jade', color: '#1b6b50', name: 'Jade Emerald', price: 25 },
        { id: 'col_amethyst', color: '#8f53a1', name: 'Royal Amethyst', price: 30 },
        { id: 'col_gold', color: '#e5a93c', name: 'Imperial Gold', price: 40 },
        { id: 'col_obsidian', color: '#2c2d30', name: 'Obsidian Black', price: 15 },
        { id: 'col_ivory', color: '#f4f1ea', name: 'Ivory Porcelain', price: 25 }
      ],
      patterns: [
        { id: 'brush', name: '🖌️ Freehand', price: 0 },
        { id: 'band', name: '🎗️ Glaze Band', price: 0 },
        { id: 'pattern_warli', name: '🌾 Warli Folk', price: 20 },
        { id: 'pattern_tribal', name: '🔶 Tribal', price: 25 },
        { id: 'pattern_greek', name: '🏛️ Greek Key', price: 35 },
        { id: 'pattern_floral', name: '🌸 Floral Vine', price: 45 },
        { id: 'pattern_gold', name: '👑 Royal Gold', price: 60 }
      ]
    };

    // Load unlocked items from localStorage
    this.unlockedItems = new Set(
      JSON.parse(localStorage.getItem('pottery_unlocked_items') || '["col_cobalt", "col_clay", "brush", "band"]')
    );

    this.initBaseClay();
  }

  isUnlocked(id) {
    return this.unlockedItems.has(id);
  }

  unlockItem(id) {
    this.unlockedItems.add(id);
    localStorage.setItem('pottery_unlocked_items', JSON.stringify([...this.unlockedItems]));
  }

  initBaseClay(color = '#c98a58') {
    this.glazeTone = color;
    const ctx = this.ctx;

    // Terracotta gradient with subtle clay grain
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#be7b4a');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, '#a66436');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle horizontal throwing ridges
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let y = 0; y < this.height; y += 4) {
      if (Math.sin(y * 0.15) > 0.4) {
        ctx.fillRect(0, y, this.width, 2);
      }
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let y = 2; y < this.height; y += 4) {
      if (Math.cos(y * 0.15) > 0.4) {
        ctx.fillRect(0, y, this.width, 2);
      }
    }

    this.paintedStrokesCount = 0;
    this.history = [];
    this.saveState();
    this.texture.needsUpdate = true;
  }

  // Restore exact painted texture from saved DataURL (for inventory pots!)
  loadFromDataURL(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(img, 0, 0, this.width, this.height);
      this.history = [];
      this.saveState();
      this.texture.needsUpdate = true;
      if (callback) callback();
    };
    img.src = dataUrl;
  }

  saveState() {
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push(this.ctx.getImageData(0, 0, this.width, this.height));
  }

  undo() {
    if (this.history.length > 1) {
      this.history.pop();
      const prev = this.history[this.history.length - 1];
      this.ctx.putImageData(prev, 0, 0);
      this.texture.needsUpdate = true;
      return true;
    }
    return false;
  }

  paintAtUV(u, v, isStart = false) {
    const x = Math.floor(u * this.width);
    const y = Math.floor((1 - v) * this.height);

    this.ctx.save();
    this.ctx.fillStyle = this.brushColor;
    this.ctx.strokeStyle = this.brushColor;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = this.brushSize;

    if (isStart || !this.lastPoint) {
      this.saveState();
      this.ctx.beginPath();
      this.ctx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
    this.lastPoint = { x, y };
    this.paintedStrokesCount++;
    this.texture.needsUpdate = true;
  }

  endStroke() {
    this.lastPoint = null;
  }

  applyCircumferenceBand(v, patternType = 'band') {
    this.saveState();
    const yCenter = Math.floor((1 - v) * this.height);
    const bandHeight = Math.max(24, this.brushSize * 2.2);
    const ctx = this.ctx;

    ctx.save();
    if (patternType === 'band') {
      ctx.fillStyle = this.brushColor;
      ctx.fillRect(0, yCenter - bandHeight / 2, this.width, bandHeight);
      ctx.fillStyle = '#f0c05a';
      ctx.fillRect(0, yCenter - bandHeight / 2 - 2, this.width, 3);
      ctx.fillRect(0, yCenter + bandHeight / 2 - 1, this.width, 3);
    } else if (patternType === 'pattern_warli') {
      this.drawWarliBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_greek') {
      this.drawGreekKeyBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_tribal') {
      this.drawTribalBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_floral') {
      this.drawFloralBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_gold') {
      this.drawGoldEmbossedBand(yCenter, bandHeight);
    }

    ctx.restore();
    this.paintedStrokesCount += 12;
    this.texture.needsUpdate = true;
  }

  drawWarliBand(yCenter, bandHeight) {
    const ctx = this.ctx;
    const h = Math.max(36, bandHeight * 1.3);
    const yTop = yCenter - h / 2;

    // Traditional Burnt Ochre/Terracotta backing strip
    ctx.fillStyle = '#8f3c1b';
    ctx.fillRect(0, yTop, this.width, h);

    // Rice-water white lines & sawtooth border
    ctx.strokeStyle = '#fffdfa';
    ctx.fillStyle = '#fffdfa';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(0, yTop + 3);
    ctx.lineTo(this.width, yTop + 3);
    ctx.moveTo(0, yTop + h - 3);
    ctx.lineTo(this.width, yTop + h - 3);
    ctx.stroke();

    // Repeating Warli Dancers holding hands
    const step = 28;
    const count = Math.ceil(this.width / step);

    for (let i = 0; i < count; i++) {
      const x = i * step + step * 0.5;
      const midY = yCenter;

      // Circular head
      ctx.beginPath();
      ctx.arc(x, midY - h * 0.28, 3, 0, Math.PI * 2);
      ctx.fill();

      // Body: Two triangles joined at vertices (Torso & Hips)
      ctx.beginPath();
      ctx.moveTo(x - 5, midY - h * 0.2);
      ctx.lineTo(x + 5, midY - h * 0.2);
      ctx.lineTo(x, midY - h * 0.05);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x - 5, midY + h * 0.1);
      ctx.lineTo(x + 5, midY + h * 0.1);
      ctx.lineTo(x, midY - h * 0.05);
      ctx.closePath();
      ctx.fill();

      // Dancing Legs
      ctx.beginPath();
      ctx.moveTo(x - 3, midY + h * 0.1);
      ctx.lineTo(x - 6, midY + h * 0.32);
      ctx.moveTo(x + 3, midY + h * 0.1);
      ctx.lineTo(x + 6, midY + h * 0.32);
      ctx.stroke();

      // Arched interlocking arms holding neighbor's hand
      ctx.beginPath();
      ctx.moveTo(x, midY - h * 0.08);
      ctx.quadraticCurveTo(x - step * 0.3, midY - h * 0.02, x - step * 0.5, midY + h * 0.04);
      ctx.moveTo(x, midY - h * 0.08);
      ctx.quadraticCurveTo(x + step * 0.3, midY - h * 0.02, x + step * 0.5, midY + h * 0.04);
      ctx.stroke();
    }
  }

  drawGreekKeyBand(yCenter, bandHeight) {
    const ctx = this.ctx;
    const h = bandHeight;
    const yTop = yCenter - h / 2;

    ctx.fillStyle = this.brushColor;
    ctx.fillRect(0, yTop, this.width, h);

    ctx.strokeStyle = '#f8e29a';
    ctx.lineWidth = Math.max(3, h * 0.12);
    ctx.lineCap = 'square';

    const cellW = h * 0.9;
    const count = Math.ceil(this.width / cellW);

    for (let i = 0; i < count; i++) {
      const x0 = i * cellW;
      ctx.beginPath();
      ctx.moveTo(x0, yTop + h * 0.15);
      ctx.lineTo(x0 + cellW * 0.85, yTop + h * 0.15);
      ctx.lineTo(x0 + cellW * 0.85, yTop + h * 0.85);
      ctx.lineTo(x0 + cellW * 0.25, yTop + h * 0.85);
      ctx.lineTo(x0 + cellW * 0.25, yTop + h * 0.45);
      ctx.lineTo(x0 + cellW * 0.6, yTop + h * 0.45);
      ctx.lineTo(x0 + cellW * 0.6, yTop + h * 0.65);
      ctx.stroke();
    }
  }

  drawTribalBand(yCenter, bandHeight) {
    const ctx = this.ctx;
    const h = bandHeight;
    const yTop = yCenter - h / 2;

    ctx.fillStyle = this.brushColor;
    ctx.fillRect(0, yTop, this.width, h);

    const step = h * 0.8;
    const count = Math.ceil(this.width / step);

    ctx.fillStyle = '#ffdf80';
    for (let i = 0; i < count; i++) {
      const x = i * step;
      ctx.beginPath();
      ctx.moveTo(x + step * 0.5, yTop + h * 0.15);
      ctx.lineTo(x + step * 0.9, yCenter);
      ctx.lineTo(x + step * 0.5, yTop + h * 0.85);
      ctx.lineTo(x + step * 0.1, yCenter);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#b32424';
      ctx.beginPath();
      ctx.arc(x + step * 0.5, yCenter, h * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffdf80';
    }
  }

  drawFloralBand(yCenter, bandHeight) {
    const ctx = this.ctx;
    const h = bandHeight;
    const yTop = yCenter - h / 2;

    ctx.fillStyle = 'rgba(25, 45, 30, 0.88)';
    ctx.fillRect(0, yTop, this.width, h);

    ctx.strokeStyle = '#62ad5b';
    ctx.lineWidth = Math.max(3, h * 0.1);
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += 10) {
      const y = yCenter + Math.sin(x * 0.05) * (h * 0.28);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const step = 45;
    for (let x = 15; x < this.width; x += step) {
      const y = yCenter + Math.sin(x * 0.05) * (h * 0.28);
      ctx.fillStyle = '#ff7597';
      ctx.beginPath();
      ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
      ctx.arc(x - 5, y - 2, 5, 0, Math.PI * 2);
      ctx.arc(x + 5, y - 2, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffd13b';
      ctx.beginPath();
      ctx.arc(x, y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGoldEmbossedBand(yCenter, bandHeight) {
    const ctx = this.ctx;
    const h = bandHeight;
    const yTop = yCenter - h / 2;

    const goldGrad = ctx.createLinearGradient(0, yTop, 0, yTop + h);
    goldGrad.addColorStop(0, '#f9e69c');
    goldGrad.addColorStop(0.3, '#d4a23a');
    goldGrad.addColorStop(0.6, '#fff4cc');
    goldGrad.addColorStop(1, '#9e731b');

    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, yTop, this.width, h);

    ctx.fillStyle = '#fff6d6';
    for (let x = 6; x < this.width; x += 14) {
      ctx.beginPath();
      ctx.arc(x, yTop + 4, 3, 0, Math.PI * 2);
      ctx.arc(x, yTop + h - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  getDecorationBonus() {
    return Math.min(100, Math.round(this.paintedStrokesCount * 1.8));
  }

  toDataURL() {
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }
}
