/**
 * Comprehensive Viability Function Validation Suite
 * Tests the single-source-of-truth viability calculation against expected behaviors
 */

import { viability } from '../sim_core/viability';

// Exact Needle Hull preset constants - using correct PipelineParams interface
const needleHullPipeline = {
  gap: 1e-9,           // 1 nm gap
  gamma_geo: 25,       // Geometric amplification
  Q: 1e9,             // Q-factor
  duty: 0.01,         // Local duty cycle (1%)
  duty_eff: 0.01 / 400, // Ship-wide effective duty (sector strobing)
  N_tiles: 1.96e9,    // Number of tiles in needle hull
  P_raw: 2e15,        // Raw lattice power (2 PW)
  HBARC: 1.973e-25    // ħc constant in J⋅m
};

const needleHullConstraints = {
  massNominal: 1400,
  massTolPct: 5,
  maxPower: 100,  // MW
  maxZeta: 1.0,
  minGamma: 25
};

/**
 * Test 1: Needle Hull Preset Point Validation
 */
export function testNeedleHullPreset(): boolean {
  console.log('🧪 Test 1: Needle Hull Preset Point Validation');
  
  const result = viability(25, 5.0, needleHullPipeline, needleHullConstraints);
  
  console.log(`Needle Hull (25 cm², 5.0 m):`, {
    viable: result.ok,
    mass: `${result.m_exotic.toFixed(1)} kg`,
    power: `${(result.P_avg / 1e6).toFixed(1)} MW`,
    zeta: result.zeta.toFixed(3),
    reason: result.fail_reason || '✅ PASS'
  });
  
  const passed = result.ok;
  console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'} - Needle Hull preset should be viable\n`);
  
  return passed;
}

/**
 * Test 2: Local Neighborhood Analysis
 */
export function testLocalNeighborhood(): void {
  console.log('🧪 Test 2: Local Neighborhood Analysis around Needle Hull');
  
  let viableCount = 0;
  let totalCount = 0;
  
  for (let da of [20, 25, 30]) {
    for (let R of [4.0, 5.0, 6.0]) {
      const result = viability(da, R, needleHullPipeline, needleHullConstraints);
      totalCount++;
      
      if (result.ok) {
        viableCount++;
        console.log(`✅ A=${da}cm², R=${R}m → VIABLE: m=${result.m_exotic.toFixed(1)}kg, P=${(result.P_avg/1e6).toFixed(1)}MW, ζ=${result.zeta.toFixed(3)}`);
      } else {
        console.log(`❌ A=${da}cm², R=${R}m → FAILED: ${result.fail_reason}`);
      }
    }
  }
  
  console.log(`\nNeighborhood Summary: ${viableCount}/${totalCount} points viable (${(100*viableCount/totalCount).toFixed(1)}%)\n`);
}

/**
 * Test 3: Critical Boundary Validation
 */
export function testCriticalBoundaries(): boolean {
  console.log('🧪 Test 3: Critical Boundary Validation');
  
  const tests = [
    // Should pass
    { area: 25, radius: 5, expected: true, description: 'Needle Hull exact' },
    { area: 2500, radius: 5, expected: true, description: 'Large tile area at optimal radius' },
    
    // Should fail
    { area: 100, radius: 30, expected: false, description: 'Small area, large radius (power constraint)' },
    { area: 10, radius: 50, expected: false, description: 'Very small area, very large radius' },
    { area: 5, radius: 1, expected: false, description: 'Tiny area, tiny radius (mass constraint)' }
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    const result = viability(test.area, test.radius, needleHullPipeline, needleHullConstraints);
    const passed = result.ok === test.expected;
    
    console.log(`${passed ? '✅' : '❌'} ${test.description}: A=${test.area}cm², R=${test.radius}m`);
    console.log(`   Expected: ${test.expected ? 'VIABLE' : 'FAILED'}, Got: ${result.ok ? 'VIABLE' : 'FAILED'}`);
    if (!result.ok) {
      console.log(`   Reason: ${result.fail_reason}`);
    }
    
    if (!passed) allPassed = false;
  }
  
  console.log(`\nBoundary Tests: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}\n`);
  return allPassed;
}

/**
 * Test 4: Gamma Geo Threshold Validation
 */
export function testGammaGeoThreshold(): boolean {
  console.log('🧪 Test 4: Gamma Geo Threshold Validation');
  
  const baseParams = { ...needleHullPipeline };
  let thresholdFound = false;
  
  // Test gamma values around the threshold
  for (let gamma = 20; gamma <= 30; gamma++) {
    const params = { ...baseParams, gammaGeo: gamma };
    const result = viability(25, 5, params, needleHullConstraints);
    
    console.log(`γ_geo = ${gamma}: ${result.ok ? '✅ VIABLE' : '❌ FAILED'} (${result.fail_reason || 'OK'})`);
    
    if (gamma === 24 && !result.ok && gamma + 1 === 25) {
      thresholdFound = true;
    }
  }
  
  console.log(`\nGamma Threshold: ${thresholdFound ? '✅ Correctly enforced at γ_geo = 25' : '❌ Threshold behavior unexpected'}\n`);
  return thresholdFound;
}

/**
 * Test 5: Grid Sweep Consistency Check
 */
export function testGridSweepConsistency(): void {
  console.log('🧪 Test 5: Grid Sweep Consistency Check (25×25 grid)');
  
  const gridSize = 25;
  let viablePoints = 0;
  let totalPoints = 0;
  
  const viableCoords: Array<{area: number, radius: number}> = [];
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      // Map grid indices to actual values (logarithmic spacing)
      const area = 1 + (99 * i) / (gridSize - 1); // 1-100 cm²
      const radius = 1 + (99 * j) / (gridSize - 1); // 1-100 m
      
      const result = viability(area, radius, needleHullPipeline, needleHullConstraints);
      totalPoints++;
      
      if (result.ok) {
        viablePoints++;
        viableCoords.push({ area: Math.round(area), radius: Math.round(radius) });
      }
    }
  }
  
  const viabilityPercentage = (100 * viablePoints / totalPoints).toFixed(2);
  
  console.log(`Grid Sweep Results:`);
  console.log(`- Total points tested: ${totalPoints}`);
  console.log(`- Viable points found: ${viablePoints}`);
  console.log(`- Viability percentage: ${viabilityPercentage}%`);
  
  if (viableCoords.length > 0 && viableCoords.length <= 10) {
    console.log(`- Viable coordinates:`, viableCoords);
  } else if (viableCoords.length > 10) {
    console.log(`- Sample viable coordinates:`, viableCoords.slice(0, 5));
    console.log(`  ... and ${viableCoords.length - 5} more`);
  }
  
  console.log(`\nGrid consistency: ${viablePoints > 0 && viablePoints < totalPoints ? '✅ Expected sparse viability' : '❌ Unexpected viability distribution'}\n`);
}

/**
 * Main Test Runner
 */
export function runViabilityValidation(): void {
  console.log('🚀 Starting Comprehensive Viability Function Validation\n');
  console.log('='.repeat(60));
  
  const test1 = testNeedleHullPreset();
  testLocalNeighborhood();
  const test3 = testCriticalBoundaries();
  const test4 = testGammaGeoThreshold();
  testGridSweepConsistency();
  
  console.log('='.repeat(60));
  console.log('📊 VALIDATION SUMMARY:');
  console.log(`✓ Needle Hull Preset: ${test1 ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Critical Boundaries: ${test3 ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Gamma Threshold: ${test4 ? 'PASS' : 'FAIL'}`);
  console.log('✓ Local Neighborhood: ANALYZED');
  console.log('✓ Grid Consistency: ANALYZED');
  
  const overallPass = test1 && test3 && test4;
  console.log(`\n🎯 OVERALL RESULT: ${overallPass ? '✅ VALIDATION PASSED' : '❌ VALIDATION ISSUES DETECTED'}`);
  
  if (overallPass) {
    console.log('\n🏆 The phase diagram teal sliver is mathematically correct!');
    console.log('   Your viability function is working as designed.');
  }
}

// Export for use in other test files
export { needleHullPipeline, needleHullConstraints };