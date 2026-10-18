import { describe, expect, it } from "vitest";
import { GEO_VIS_THETA_PRESET } from "@/lib/warpfield-presets";
import { buildStressEnergyBrick } from "../server/stress-energy-brick";
import { calculateNatarioWarpBubble } from "../modules/warp/natario-warp";
import { getGlobalPipelineState, initializePipelineState, setGlobalPipelineState } from "../server/energy-pipeline";

type Vec3 = [number, number, number];

const INV16PI = 0.019894367886486918;

const sech2 = (x: number) => {
  const c = Math.cosh(x);
  return 1 / (c * c);
};

const dTopHatDr = (r: number, sigma: number, R: number) => {
  const den = Math.max(1e-8, 2 * Math.tanh(sigma * R));
  return sigma * (sech2(sigma * (r + R)) - sech2(sigma * (r - R))) / den;
};

const thetaGr2D = (gx: number, gz: number, axes: Vec3, domainScale: number, sigma: number, R: number, beta: number, thetaSign: 1 | -1) => {
  const xView = gx * domainScale * axes[0];
  const zView = gz * domainScale * axes[2];
  const ax = Math.max(1e-6, axes[0]);
  const az = Math.max(1e-6, axes[2]);
  const mx = xView / ax;
  const mz = zView / az;
  const r = Math.sqrt(mx * mx + mz * mz);
  const cos = mx / Math.max(r, 1e-6);
  const dfdr = dTopHatDr(r, sigma, R);
  return thetaSign * beta * cos * dfdr;
};

const thetaGr3D = (gx: number, gz: number, axes: Vec3, domainScale: number, sigma: number, R: number, beta: number, thetaSign: 1 | -1) => {
  const xView = gx * domainScale * axes[0];
  const yView = 0;
  const zView = gz * domainScale * axes[2];
  const ax = Math.max(1e-6, axes[0]);
  const ay = Math.max(1e-6, axes[1]);
  const az = Math.max(1e-6, axes[2]);
  const mx = xView / ax;
  const my = yView / ay;
  const mz = zView / az;
  const r = Math.sqrt(mx * mx + my * my + mz * mz);
  const invR = 1 / Math.max(r, 1e-6);
  const dirX = mx * invR;
  const dfdr = dTopHatDr(r, sigma, R);
  return thetaSign * beta * dirX * dfdr;
};

const rhoGr3D = (pos: Vec3, axes: Vec3, sigma: number, R: number, beta: number) => {
  const ax = Math.max(1e-6, axes[0]);
  const ay = Math.max(1e-6, axes[1]);
  const az = Math.max(1e-6, axes[2]);
  const mx = pos[0] / ax;
  const my = pos[1] / ay;
  const mz = pos[2] / az;
  const r = Math.sqrt(mx * mx + my * my + mz * mz);
  const invR = 1 / Math.max(r, 1e-6);
  const dirX = mx * invR;
  const dirY = my * invR;
  const dirZ = mz * invR;
  const dfdr = dTopHatDr(r, sigma, R);
  const dfy = dfdr * dirY;
  const dfz = dfdr * dirZ;
  const base = dirX * dfdr;
  const Kxx = -beta * base;
  const Kxy = -0.5 * beta * dfy;
  const Kxz = -0.5 * beta * dfz;
  const K2 = Kxx * Kxx;
  const KijKij = Kxx * Kxx + 2 * Kxy * Kxy + 2 * Kxz * Kxz;
  return (K2 - KijKij) * INV16PI;
};

const radialPeak = (
  values: Float32Array,
  dims: [number, number, number],
  bounds: { min: Vec3; max: Vec3 },
  axes: Vec3,
  bins = 12,
) => {
  const [nx, ny, nz] = dims;
  const dx = (bounds.max[0] - bounds.min[0]) / nx;
  const dy = (bounds.max[1] - bounds.min[1]) / ny;
  const dz = (bounds.max[2] - bounds.min[2]) / nz;

  const corners: Vec3[] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ];
  let maxRadius = 0;
  for (const c of corners) {
    const r = Math.hypot(c[0] / axes[0], c[1] / axes[1], c[2] / axes[2]);
    if (r > maxRadius) maxRadius = r;
  }
  const binWidth = maxRadius / bins;
  const sumAbs = new Array<number>(bins).fill(0);
  const sumVal = new Array<number>(bins).fill(0);
  const counts = new Array<number>(bins).fill(0);

  let idx = 0;
  for (let z = 0; z < nz; z++) {
    const pz = bounds.min[2] + (z + 0.5) * dz;
    for (let y = 0; y < ny; y++) {
      const py = bounds.min[1] + (y + 0.5) * dy;
      for (let x = 0; x < nx; x++) {
        const px = bounds.min[0] + (x + 0.5) * dx;
        const r = Math.hypot(px / axes[0], py / axes[1], pz / axes[2]);
        const bin = Math.min(bins - 1, Math.floor((r / Math.max(1e-6, maxRadius)) * bins));
        const value = values[idx] ?? 0;
        sumAbs[bin] += Math.abs(value);
        sumVal[bin] += value;
        counts[bin] += 1;
        idx += 1;
      }
    }
  }

  let peakBin = 0;
  let peakAbs = -Infinity;
  for (let i = 0; i < bins; i++) {
    const meanAbs = counts[i] > 0 ? sumAbs[i] / counts[i] : 0;
    if (meanAbs > peakAbs) {
      peakAbs = meanAbs;
      peakBin = i;
    }
  }

  const meanVal = counts[peakBin] > 0 ? sumVal[peakBin] / counts[peakBin] : 0;
  return {
    peakRadius: (peakBin + 0.5) * binWidth,
    peakMean: meanVal,
    binWidth,
  };
};

describe("warpfield cross-validation", () => {
  it("keeps theta parity between 2D slice and 3D analytic evaluation", () => {
    const axes: Vec3 = [12, 6, 4];
    const domainScale = 1.3;
    const sigma = 6;
    const R = 1.1;
    const beta = 0.32;
    const thetaSign: 1 | -1 = -1;

    const samples = [
      { gx: -0.85, gz: -0.55 },
      { gx: -0.5, gz: 0.2 },
      { gx: -0.1, gz: 0.8 },
      { gx: 0.15, gz: -0.4 },
      { gx: 0.5, gz: 0.1 },
      { gx: 0.9, gz: -0.75 },
    ];

    for (const s of samples) {
      const t2 = thetaGr2D(s.gx, s.gz, axes, domainScale, sigma, R, beta, thetaSign);
      const t3 = thetaGr3D(s.gx, s.gz, axes, domainScale, sigma, R, beta, thetaSign);
      expect(t2).toBeCloseTo(t3, 10);
    }
  });

  it("reports Natario invariants near zero", () => {
    const result = calculateNatarioWarpBubble({
      warpFieldType: "natario",
      bowlRadius: 25_000,
      sagDepth: 16,
      gap: 1,
      cavityQ: 1e9,
      burstDuration: 10,
      cycleDuration: 1000,
      sectorCount: 400,
      dutyFactor: 0.01,
      effectiveDuty: 0.0025,
      shiftAmplitude: 0.08,
      expansionTolerance: 1e-6,
      gammaGeo: 26,
      gammaVanDenBroeck: 1e5,
      qSpoilingFactor: 1,
      tileCount: 1600,
      tileArea_m2: 0.05 * 0.05,
    });

    expect(Math.abs(result.expansionScalar)).toBeLessThan(1e-6);
    expect(Math.abs(result.curlMagnitude)).toBeLessThan(1e-6);
    expect(result.isZeroExpansion).toBe(true);
    expect(result.isCurlFree).toBe(true);
  });

  it("keeps brick and analytic shells aligned in sign and radius", () => {
    const prevState = getGlobalPipelineState();
    const nextState = initializePipelineState();
    nextState.hull = { Lx_m: 2, Ly_m: 2, Lz_m: 2, wallThickness_m: 0.12 };
    setGlobalPipelineState(nextState);

    try {
      const dims: [number, number, number] = [24, 24, 24];
      const bounds = { min: [-1, -1, -1] as Vec3, max: [1, 1, 1] as Vec3 };
      const brick = buildStressEnergyBrick({
        dims,
        bounds,
        phase01: 0.12,
        sigmaSector: 0.05,
        splitEnabled: false,
        splitFrac: 0.6,
        dutyFR: 0.0025,
        q: 1,
        gammaGeo: 26,
        gammaVdB: 1e5,
        ampBase: 0.2,
        zeta: 0.82,
      });

      const axes: Vec3 = [1, 1, 1];
      const total = dims[0] * dims[1] * dims[2];
      const rho = new Float32Array(total);
      const dx = (bounds.max[0] - bounds.min[0]) / dims[0];
      const dy = (bounds.max[1] - bounds.min[1]) / dims[1];
      const dz = (bounds.max[2] - bounds.min[2]) / dims[2];
      const sigma = 6;
      const R = 1;
      const beta = 0.25;

      let idx = 0;
      for (let z = 0; z < dims[2]; z++) {
        const pz = bounds.min[2] + (z + 0.5) * dz;
        for (let y = 0; y < dims[1]; y++) {
          const py = bounds.min[1] + (y + 0.5) * dy;
          for (let x = 0; x < dims[0]; x++) {
            const px = bounds.min[0] + (x + 0.5) * dx;
            rho[idx] = rhoGr3D([px, py, pz], axes, sigma, R, beta);
            idx += 1;
          }
        }
      }

      const t00Peak = radialPeak(brick.channels.t00.data, dims, bounds, axes);
      const rhoPeak = radialPeak(rho, dims, bounds, axes);
      expect(Math.sign(t00Peak.peakMean)).toBe(Math.sign(rhoPeak.peakMean));
      expect(Math.abs(t00Peak.peakRadius - rhoPeak.peakRadius)).toBeLessThanOrEqual(t00Peak.binWidth * 1.5);
    } finally {
      setGlobalPipelineState(prevState);
    }
  });

  it("keeps GeoVis theta preset aligned with parity defaults", () => {
    expect(GEO_VIS_THETA_PRESET.hullVolumeViz).toBe("theta_gr");
    expect(GEO_VIS_THETA_PRESET.planarVizMode).toBe(3);
    expect(GEO_VIS_THETA_PRESET.thetaSign).toBe(-1);
    expect(GEO_VIS_THETA_PRESET.showThetaIsoOverlay).toBe(true);
    expect(GEO_VIS_THETA_PRESET.palette).toEqual({
      id: "diverging",
      encodeBetaSign: true,
      legend: true,
    });
  });
});
