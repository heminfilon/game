import * as THREE from 'three';

export class PotteryModel {
  constructor() {
    this.segmentsY = 32;       // vertical resolution
    this.segmentsRadial = 48;  // rotational resolution
    this.minRadius = 0.35;
    this.maxRadius = 2.4;
    this.minHeight = 1.2;
    this.maxHeight = 3.8;

    this.height = 2.2;         // current model height units (approx 22cm)
    this.wallThickness = 0.12;

    // Outer profile radii: array of radii from bottom (index 0) to top (index N-1)
    this.profileRadii = [];
    this.initDefaultProfile();

    this.geometry = new THREE.BufferGeometry();
    this.mesh = null;
    this.innerMesh = null;
  }

  initDefaultProfile() {
    this.profileRadii = [];
    for (let i = 0; i < this.segmentsY; i++) {
      const t = i / (this.segmentsY - 1);
      // Nice gentle initial vase curve
      const baseR = 0.9;
      const belly = Math.sin(t * Math.PI) * 0.35;
      const taper = (1 - t * 0.25);
      this.profileRadii.push((baseR + belly) * taper);
    }
  }

  // Calculate actual height in cm (1 unit ~ 10 cm, so 2.2 = 22cm)
  getHeightCm() {
    return Math.round(this.height * 10 * 10) / 10;
  }

  // Deform radii based on touch interaction
  // normalizedY is 0.0 (base) to 1.0 (top)
  // deltaRadius is positive (expand/pull) or negative (pinch/push in)
  deformRadius(normalizedY, deltaRadius, radiusRange = 0.22) {
    const targetIdx = Math.round(normalizedY * (this.segmentsY - 1));
    const sigma = this.segmentsY * radiusRange;

    for (let i = 0; i < this.segmentsY; i++) {
      const dist = Math.abs(i - targetIdx);
      const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      
      // Base stays stable on wheel
      let anchorFactor = 1.0;
      if (i === 0) anchorFactor = 0.05;
      else if (i === 1) anchorFactor = 0.3;
      else if (i === 2) anchorFactor = 0.7;

      let r = this.profileRadii[i] + deltaRadius * weight * anchorFactor;
      r = Math.max(this.minRadius, Math.min(this.maxRadius, r));
      this.profileRadii[i] = r;
    }

    this.rebuildGeometry();
  }

  // Stretch / compress height
  adjustHeight(deltaH) {
    this.height = Math.max(this.minHeight, Math.min(this.maxHeight, this.height + deltaH));
    this.rebuildGeometry();
  }

  // Smooth out any sharp bumps or creases
  smoothProfile() {
    const smoothed = [...this.profileRadii];
    for (let i = 1; i < this.segmentsY - 1; i++) {
      smoothed[i] = (this.profileRadii[i - 1] + this.profileRadii[i] * 2 + this.profileRadii[i + 1]) / 4;
    }
    this.profileRadii = smoothed;
    this.rebuildGeometry();
  }

  reset() {
    this.height = 2.2;
    this.initDefaultProfile();
    this.rebuildGeometry();
  }

  // Create or update Lathe geometry
  createMesh(material) {
    this.rebuildGeometry();
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    return this.mesh;
  }

  rebuildGeometry() {
    // Generate 2D cross-section points from base to rim, then down inside
    const points = [];
    const N = this.segmentsY;

    // 1. Bottom center (outside)
    points.push(new THREE.Vector2(0, 0));

    // 2. Base corner
    points.push(new THREE.Vector2(this.profileRadii[0], 0));

    // 3. Outer wall going up
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const y = t * this.height;
      const r = this.profileRadii[i];
      points.push(new THREE.Vector2(r, y));
    }

    // 4. Rim rounded lip
    const rimRadius = this.profileRadii[N - 1];
    const innerRimR = Math.max(0.12, rimRadius - this.wallThickness);
    points.push(new THREE.Vector2((rimRadius + innerRimR) / 2, this.height + 0.03));
    points.push(new THREE.Vector2(innerRimR, this.height));

    // 5. Inner wall going down
    for (let i = N - 1; i >= 0; i--) {
      const t = i / (N - 1);
      const y = Math.max(this.wallThickness, t * this.height);
      const outerR = this.profileRadii[i];
      const innerR = Math.max(0.1, outerR - this.wallThickness);
      points.push(new THREE.Vector2(innerR, y));
    }

    // 6. Inner bottom center
    points.push(new THREE.Vector2(0, this.wallThickness));

    // Dispose old geometry
    if (this.geometry) {
      this.geometry.dispose();
    }

    // Generate Lathe
    this.geometry = new THREE.LatheGeometry(points, this.segmentsRadial);
    this.geometry.computeVertexNormals();

    if (this.mesh) {
      this.mesh.geometry = this.geometry;
    }
  }

  // Analyze the pot for appraisal:
  // - Height (major factor requested by user)
  // - Curvature complexity (shape aesthetics)
  // - Slenderness / elegance
  evaluatePotStats() {
    const heightCm = this.getHeightCm();
    
    // Average radius & variance
    let sumR = 0;
    this.profileRadii.forEach(r => sumR += r);
    const avgR = sumR / this.profileRadii.length;

    let variance = 0;
    for (let i = 0; i < this.profileRadii.length; i++) {
      variance += Math.pow(this.profileRadii[i] - avgR, 2);
    }
    const stdDev = Math.sqrt(variance / this.profileRadii.length);

    // Number of inflection points (curves/waists)
    let turns = 0;
    for (let i = 1; i < this.profileRadii.length - 1; i++) {
      const d1 = this.profileRadii[i] - this.profileRadii[i - 1];
      const d2 = this.profileRadii[i + 1] - this.profileRadii[i];
      if (d1 * d2 < 0) turns++;
    }

    // Base value influenced strongly by height:
    // e.g. 15cm -> ~45 coins, 30cm -> ~110 coins, 45cm -> ~185 coins
    const heightBonus = Math.round(Math.pow(heightCm, 1.42) * 0.95);
    const shapeBonus = Math.round(stdDev * 35 + turns * 10);
    const basePrice = Math.max(30, heightBonus + shapeBonus);

    let styleName = "Rustic Clay Pot";
    if (heightCm > 32 && turns >= 2) styleName = "Graceful Amphora";
    else if (heightCm > 30) styleName = "Tall Imperial Vase";
    else if (stdDev > 0.4) styleName = "Hourglass Goblet";
    else if (heightCm < 18 && avgR > 1.3) styleName = "Ceramic Basin";
    else if (heightCm < 20) styleName = "Tea Master's Bowl";
    else if (turns >= 2) styleName = "Serpentine Urn";

    return {
      heightCm,
      basePrice,
      styleName,
      turns,
      avgRadius: Math.round(avgR * 10 * 10) / 10
    };
  }

  exportData() {
    return {
      height: this.height,
      profileRadii: [...this.profileRadii]
    };
  }

  importData(data) {
    if (data && data.height && Array.isArray(data.profileRadii)) {
      this.height = data.height;
      this.profileRadii = [...data.profileRadii];
      this.rebuildGeometry();
    }
  }
}
