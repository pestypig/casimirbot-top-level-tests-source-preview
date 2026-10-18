#!/usr/bin/env python3
"""
Main test runner for Casimir-Tile Calculator
Runs all quality assurance tests and reports results
"""
import sys
import traceback
from test_static import test_parallel_plate_analytic, test_gap_scaling
from test_dynamic import test_period_frequency_relation, test_duty_factor_bounds, test_exotic_mass_targets
from test_convergence import test_xi_points_adequacy, test_error_tolerance, test_quantum_safety_bounds

def run_test_suite():
    """Run complete test suite with error handling"""
    tests = [
        ("Static: Parallel Plate Analytic", test_parallel_plate_analytic),
        ("Static: Gap Scaling", test_gap_scaling),
        ("Dynamic: Period-Frequency", test_period_frequency_relation),
        ("Dynamic: Duty Factor Bounds", test_duty_factor_bounds),
        ("Dynamic: Exotic Mass Targets", test_exotic_mass_targets),
        ("Convergence: Xi Points", test_xi_points_adequacy),
        ("Convergence: Error Tolerance", test_error_tolerance),
        ("Safety: Quantum Bounds", test_quantum_safety_bounds),
    ]
    
    passed = 0
    failed = 0
    
    print("="*60)
    print("CASIMIR-TILE CALCULATOR QUALITY ASSURANCE TESTS")
    print("="*60)
    
    for test_name, test_func in tests:
        try:
            print(f"\nRunning: {test_name}")
            test_func()
            passed += 1
            print(f"✓ PASSED: {test_name}")
        except Exception as e:
            failed += 1
            print(f"✗ FAILED: {test_name}")
            print(f"  Error: {str(e)}")
            traceback.print_exc()
    
    print("\n" + "="*60)
    print(f"TEST RESULTS: {passed} passed, {failed} failed")
    print("="*60)
    
    if failed == 0:
        print("🎉 ALL TESTS PASSED - Calculator is verified!")
        return True
    else:
        print(f"⚠️  {failed} TESTS FAILED - Check calculations!")
        return False

if __name__ == "__main__":
    success = run_test_suite()
    sys.exit(0 if success else 1)