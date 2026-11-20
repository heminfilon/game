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
    this.brushColor = '#2b4c7e'; // Cobalt blue
    this.brushSize = 18;
    this.selectedTool = 'brush'; // 'brush', 'band', 'pattern_greek', 'pattern_tribal', 'pattern_floral', 'pattern_gold'
    this.glazeTone = '#d49b6a';  // Raw terracotta clay

    this.history = [];
    this.maxHistory = 10;
    this.paintedStrokesCount = 0;

    this.initBaseClay();
  }

  initBaseClay(color = '#c98a58') {
    this.glazeTone = color;
    const ctx = this.ctx;

    // Rich terracotta gradient with subtle clay throwing grain
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#be7b4a');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, '#a66436');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle horizontal throwing rings
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
    this.saveState();
    this.texture.needsUpdate = true;
  }

  saveState() {
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push(this.ctx.getImageData(0, 0, this.width, this.height));
  }

  undo() {
    if (this.history.length > 1) {
      this.history.pop(); // Remove current
      const prev = this.history[this.history.length - 1];
      this.ctx.putImageData(prev, 0, 0);
      this.texture.needsUpdate = true;
      return true;
    }
    return false;
  }

  // Draw freehand dot or line segment on UV
  paintAtUV(u, v, isStart = false) {
    const x = Math.floor(u * this.width);
    const y = Math.floor((1 - v) * this.height); // UV v is inverted relative to canvas y

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

      // Wrap around seam if near boundary
      if (Math.abs(x - this.lastPoint.x) > this.width * 0.5) {
        // Cross boundary
      }
    }

    this.ctx.restore();
    this.lastPoint = { x, y };
    this.paintedStrokesCount++;
    this.texture.needsUpdate = true;
  }

  endStroke() {
    this.lastPoint = null;
  }

  // Apply a full horizontal decorative band at UV v (height)
  applyCircumferenceBand(v, patternType = 'band') {
    this.saveState();
    const yCenter = Math.floor((1 - v) * this.height);
    const bandHeight = Math.max(24, this.brushSize * 2.2);
    const ctx = this.ctx;

    ctx.save();
    if (patternType === 'band') {
      // Solid colored glaze band with gold borders
      ctx.fillStyle = this.brushColor;
      ctx.fillRect(0, yCenter - bandHeight / 2, this.width, bandHeight);
      
      ctx.fillStyle = '#f0c05a'; // gold highlight lines
      ctx.fillRect(0, yCenter - bandHeight / 2 - 2, this.width, 3);
      ctx.fillRect(0, yCenter + bandHeight / 2 - 1, this.width, 3);
    } else if (patternType === 'pattern_greek') {
      // Greek Key (Meander)
      this.drawGreekKeyBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_tribal') {
      // Tribal geometric diamonds
      this.drawTribalBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_floral') {
      // Floral / leaf vine
      this.drawFloralBand(yCenter, bandHeight);
    } else if (patternType === 'pattern_gold') {
      // Royal metallic gold embossed band
      this.drawGoldEmbossedBand(yCenter, bandHeight);
    }

    ctx.restore();
    this.paintedStrokesCount += 12;
    this.texture.needsUpdate = true;
  }

  drawGreekKeyBand(yCenter, bandHeight) {
    const ctx = this.ctx;
    const h = bandHeight;
    const yTop = yCenter - h / 2;

    // Dark backing
    ctx.fillStyle = this.brushColor;
    ctx.fillRect(0, yTop, this.width, h);

    // Gold/ivory meander lines
    ctx.strokeStyle = '#f8e29a';
    ctx.lineWidth = Math.max(3, h * 0.12);
    ctx.lineCap = 'square';

    const cellW = h * 0.9;
    const count = Math.ceil(this.width / cellW);

    for (let i = 0; i < count; i++) {
      const x0 = i * cellW;
      const x1 = x0 + cellW;
      const midY = yTop + h * 0.5;

      ctx.beginPath();
      // Meander spiral
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
      // Diamond
      ctx.beginPath();
      ctx.moveTo(x + step * 0.5, yTop + h * 0.15);
      ctx.lineTo(x + step * 0.9, yCenter);
      ctx.lineTo(x + step * 0.5, yTop + h * 0.85);
      ctx.lineTo(x + step * 0.1, yCenter);
      ctx.closePath();
      ctx.fill();

      // Inner dot
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

    ctx.fillStyle = 'rgba(25, 45, 30, 0.85)';
    ctx.fillRect(0, yTop, this.width, h);

    // Sine wave vine
    ctx.strokeStyle = '#62ad5b';
    ctx.lineWidth = Math.max(3, h * 0.1);
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += 10) {
      const y = yCenter + Math.sin(x * 0.05) * (h * 0.28);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Little flowers and leaves
    const step = 45;
    for (let x = 15; x < this.width; x += step) {
      const y = yCenter + Math.sin(x * 0.05) * (h * 0.28);
      // Lotus petals
      ctx.fillStyle = '#ff7597';
      ctx.beginPath();
      ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
      ctx.arc(x - 5, y - 2, 5, 0, Math.PI * 2);
      ctx.arc(x + 5, y - 2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Golden center
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

    // Beaded edging
    ctx.fillStyle = '#fff6d6';
    for (let x = 6; x < this.width; x += 14) {
      ctx.beginPath();
      ctx.arc(x, yTop + 4, 3, 0, Math.PI * 2);
      ctx.arc(x, yTop + h - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  getDecorationBonus() {
    // Score based on number of strokes and pattern richness
    const score = Math.min(100, Math.round(this.paintedStrokesCount * 1.8));
    return score;
  }

  toDataURL() {
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }
}
