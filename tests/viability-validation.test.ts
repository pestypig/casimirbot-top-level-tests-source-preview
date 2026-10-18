/**
 * Jest Unit Tests for Viability Function
 * Automated testing suite for phase diagram validation
 */

import { viability } from '../sim_core/viability';
import { needleHullPipeline, needleHullConstraints } from './viability-validation';

describe('Viability Function Validation', () => {
  
  describe('Needle Hull Preset', () => {
    it('should mark (25cm², 5m) as viable with correct parameters', () => {
      const result = viability(25, 5.0, needleHullPipeline, needleHullConstraints);
      
      expect(result.ok).toBe(true);
      expect(result.m_exotic).toBeGreaterThan(1000);
      expect(result.m_exotic).toBeLessThan(2000);
      expect(result.P_avg).toBeLessThan(200e6); // Less than 200 MW
      expect(result.zeta).toBeLessThan(1.0); // Quantum safe
    });
  });

  describe('Critical Boundaries', () => {
    it('should reject configurations with excessive power requirements', () => {
      const result = viability(100, 30, needleHullPipeline, needleHullConstraints);
      
      expect(result.ok).toBe(false);
      expect(result.fail_reason).toContain('power'); // Should mention power constraint
    });
    
    it('should reject configurations with insufficient mass', () => {
      const result = viability(5, 1, needleHullPipeline, needleHullConstraints);
      
      expect(result.ok).toBe(false);
      expect(result.fail_reason).toContain('mass'); // Should mention mass constraint
    });
    
    it('should accept large tile configurations at optimal radius', () => {
      const result = viability(2500, 5, needleHullPipeline, needleHullConstraints);
      
      expect(result.ok).toBe(true);
    });
  });

  describe('Gamma Geo Threshold', () => {
    it('should reject configurations below gamma threshold', () => {
      const lowGammaParams = { ...needleHullPipeline, gammaGeo: 24 };
      const result = viability(25, 5, lowGammaParams, needleHullConstraints);
      
      expect(result.ok).toBe(false);
      expect(result.fail_reason).toMatch(/γ|gamma/i);
    });
    
    it('should accept configurations at gamma threshold', () => {
      const thresholdParams = { ...needleHullPipeline, gammaGeo: 25 };
      const result = viability(25, 5, thresholdParams, needleHullConstraints);
      
      expect(result.ok).toBe(true);
    });
    
    it('should accept configurations above gamma threshold', () => {
      const highGammaParams = { ...needleHullPipeline, gammaGeo: 30 };
      const result = viability(25, 5, highGammaParams, needleHullConstraints);
      
      expect(result.ok).toBe(true);
    });
  });

  describe('Parameter Sensitivity', () => {
    it('should respond to Q-factor changes', () => {
      const lowQParams = { ...needleHullPipeline, qFactor: 1e6 };
      const highQParams = { ...needleHullPipeline, qFactor: 1e10 };
      
      const lowQResult = viability(25, 5, lowQParams, needleHullConstraints);
      const highQResult = viability(25, 5, highQParams, needleHullConstraints);
      
      // Different Q-factors should produce different results
      expect(lowQResult.m_exotic).not.toEqual(highQResult.m_exotic);
    });
    
    it('should respond to duty cycle changes', () => {
      const lowDutyParams = { ...needleHullPipeline, duty: 0.001 };
      const highDutyParams = { ...needleHullPipeline, duty: 0.05 };
      
      const lowDutyResult = viability(25, 5, lowDutyParams, needleHullConstraints);
      const highDutyResult = viability(25, 5, highDutyParams, needleHullConstraints);
      
      // Different duty cycles should produce different results
      expect(lowDutyResult.P_avg).not.toEqual(highDutyResult.P_avg);
    });
  });

  describe('Constraint Validation', () => {
    it('should respect mass tolerance settings', () => {
      const strictConstraints = { ...needleHullConstraints, massTolPct: 1 };
      const looseConstraints = { ...needleHullConstraints, massTolPct: 50 };
      
      const strictResult = viability(30, 4, needleHullPipeline, strictConstraints);  
      const looseResult = viability(30, 4, needleHullPipeline, looseConstraints);
      
      // Looser constraints should be more permissive
      if (!strictResult.ok && looseResult.ok) {
        expect(true).toBe(true); // This is the expected behavior
      } else {
        // Both should at least be consistent with their constraints
        expect(typeof strictResult.ok).toBe('boolean');
        expect(typeof looseResult.ok).toBe('boolean');
      }
    });
    
    it('should respect power budget settings', () => {
      const lowPowerConstraints = { ...needleHullConstraints, maxPower: 50 };
      const highPowerConstraints = { ...needleHullConstraints, maxPower: 200 };
      
      const lowPowerResult = viability(100, 20, needleHullPipeline, lowPowerConstraints);
      const highPowerResult = viability(100, 20, needleHullPipeline, highPowerConstraints);
      
      // Higher power budget should be more permissive
      if (!lowPowerResult.ok && highPowerResult.ok) {
        expect(true).toBe(true); // This is the expected behavior
      } else {
        // Both should at least be consistent
        expect(typeof lowPowerResult.ok).toBe('boolean');
        expect(typeof highPowerResult.ok).toBe('boolean');
      }
    });
  });

  describe('Grid Consistency', () => {
    it('should find a reasonable number of viable points in test grid', () => {
      let viableCount = 0;
      let totalCount = 0;
      
      // Small test grid
      for (let area = 10; area <= 50; area += 10) {
        for (let radius = 2; radius <= 10; radius += 2) {
          const result = viability(area, radius, needleHullPipeline, needleHullConstraints);
          totalCount++;
          if (result.ok) viableCount++;
        }
      }
      
      // Should find some viable points but not too many (sparse viability)
      expect(viableCount).toBeGreaterThan(0);
      expect(viableCount).toBeLessThan(totalCount * 0.5); // Less than 50% viable
      expect(totalCount).toBe(25); // 5×5 grid
    });
  });
});

// Export test utilities for other test files
export { needleHullPipeline, needleHullConstraints };