import * as THREE from 'three';

export class PotteryModel {
  constructor() {
    this.segmentsY = 32;       // vertical resolution
    this.segmentsRadial = 48;  // rotational resolution
    this.minRadius = 0.35;
    this.maxRadius = 1.9;      // Kept within mobile frame
    this.minHeight = 1.2;
    this.maxHeight = 3.2;      // Kept within mobile frame

    this.height = 2.1;         // default height
    this.wallThickness = 0.12;

    this.profileRadii = [];
    this.initDefaultProfile();

    this.geometry = new THREE.BufferGeometry();
    this.mesh = null;
  }

  initDefaultProfile() {
    this.profileRadii = [];
    for (let i = 0; i < this.segmentsY; i++) {
      const t = i / (this.segmentsY - 1);
      const baseR = 0.82;
      const belly = Math.sin(t * Math.PI) * 0.32;
      const taper = (1 - t * 0.22);
      this.profileRadii.push((baseR + belly) * taper);
    }
  }

  getHeightCm() {
    return Math.round(this.height * 10 * 10) / 10;
  }

  deformRadius(normalizedY, deltaRadius, radiusRange = 0.2) {
    const targetIdx = Math.round(normalizedY * (this.segmentsY - 1));
    const sigma = this.segmentsY * radiusRange;

    for (let i = 0; i < this.segmentsY; i++) {
      const dist = Math.abs(i - targetIdx);
      const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      
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

  adjustHeight(deltaH) {
    this.height = Math.max(this.minHeight, Math.min(this.maxHeight, this.height + deltaH));
    this.rebuildGeometry();
  }

  smoothProfile() {
    const smoothed = [...this.profileRadii];
    for (let i = 1; i < this.segmentsY - 1; i++) {
      smoothed[i] = (this.profileRadii[i - 1] + this.profileRadii[i] * 2 + this.profileRadii[i + 1]) / 4;
    }
    this.profileRadii = smoothed;
    this.rebuildGeometry();
  }

  reset() {
    this.height = 2.1;
    this.initDefaultProfile();
    this.rebuildGeometry();
  }

  createMesh(material) {
    this.rebuildGeometry();
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    return this.mesh;
  }

  rebuildGeometry() {
    const points = [];
    const N = this.segmentsY;

    // Outer surface
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(this.profileRadii[0], 0));

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const y = t * this.height;
      const r = this.profileRadii[i];
      points.push(new THREE.Vector2(r, y));
    }

    // Rim rounded lip
    const rimRadius = this.profileRadii[N - 1];
    const innerRimR = Math.max(0.12, rimRadius - this.wallThickness);
    points.push(new THREE.Vector2((rimRadius + innerRimR) / 2, this.height + 0.03));
    points.push(new THREE.Vector2(innerRimR, this.height));

    // Inner cavity
    for (let i = N - 1; i >= 0; i--) {
      const t = i / (N - 1);
      const y = Math.max(this.wallThickness, t * this.height);
      const outerR = this.profileRadii[i];
      const innerR = Math.max(0.1, outerR - this.wallThickness);
      points.push(new THREE.Vector2(innerR, y));
    }

    points.push(new THREE.Vector2(0, this.wallThickness));

    if (this.geometry) {
      this.geometry.dispose();
    }

    this.geometry = new THREE.LatheGeometry(points, this.segmentsRadial);
    this.geometry.computeVertexNormals();

    if (this.mesh) {
      this.mesh.geometry = this.geometry;
    }
  }

  evaluatePotStats() {
    const heightCm = this.getHeightCm();
    
    let sumR = 0;
    this.profileRadii.forEach(r => sumR += r);
    const avgR = sumR / this.profileRadii.length;

    let variance = 0;
    for (let i = 0; i < this.profileRadii.length; i++) {
      variance += Math.pow(this.profileRadii[i] - avgR, 2);
    }
    const stdDev = Math.sqrt(variance / this.profileRadii.length);

    let turns = 0;
    for (let i = 1; i < this.profileRadii.length - 1; i++) {
      const d1 = this.profileRadii[i] - this.profileRadii[i - 1];
      const d2 = this.profileRadii[i + 1] - this.profileRadii[i];
      if (d1 * d2 < 0) turns++;
    }

    const heightBonus = Math.round(Math.pow(heightCm, 1.38) * 0.9);
    const shapeBonus = Math.round(stdDev * 35 + turns * 10);
    const basePrice = Math.max(30, heightBonus + shapeBonus);

    let styleName = "Rustic Ceramic Pot";
    if (heightCm > 28 && turns >= 2) styleName = "Graceful Amphora";
    else if (heightCm > 26) styleName = "Tall Imperial Vase";
    else if (stdDev > 0.35) styleName = "Hourglass Goblet";
    else if (heightCm < 16 && avgR > 1.2) styleName = "Ceramic Basin";
    else if (heightCm < 18) styleName = "Zen Tea Master's Bowl";
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
