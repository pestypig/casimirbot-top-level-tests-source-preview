#!/usr/bin/env python3
"""
Target Value Ledger Validation Test
Test the computational recipe implementation from the research paper
"""

import requests
import json
import time

def test_target_validation_api():
    """Test the target validation API endpoint"""
    
    print("=" * 80)
    print("TARGET VALUE LEDGER VALIDATION TEST")
    print("Verifying computational recipe from research paper")
    print("=" * 80)
    
    # Test parameters matching research paper defaults
    test_params = {
        "gapA": 1e-9,          # 1 nm
        "tileRadius": 25e-3,   # 25 mm
        "sagDepth": 16e-9,     # 16 nm
        "gammaGeo": 25,        # geometric factor
        "strokeAmp": 50e-12,   # 50 pm
        "f_m": 15e9,          # 15 GHz
        "Q_i": 1e9,           # Q ≈ 10⁹
        "t_burst": 10e-6,     # 10 μs
        "t_cycle": 1e-3,      # 1 ms
        "S": 400              # 400 sectors
    }
    
    try:
        # Wait for server to be ready
        max_retries = 10
        for attempt in range(max_retries):
            try:
                response = requests.get("http://localhost:5000/api/target-validation/defaults", timeout=5)
                if response.status_code == 200:
                    break
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
                if attempt < max_retries - 1:
                    print(f"Waiting for server... (attempt {attempt + 1}/{max_retries})")
                    time.sleep(2)
                else:
                    raise
        
        # Test getting default values
        print("1. Testing Default Values API")
        defaults_response = requests.get("http://localhost:5000/api/target-validation/defaults")
        if defaults_response.status_code == 200:
            defaults = defaults_response.json()
            print(f"   ✓ Retrieved default parameters")
            print(f"   ✓ Target exotic mass: {defaults['targets']['exoticMass']:.1e} kg")
            print(f"   ✓ Target power: {defaults['targets']['power']/1e6:.0f} MW")
        else:
            print(f"   ✗ Failed to get defaults: {defaults_response.status_code}")
            return False
        
        # Test target validation computation
        print("\n2. Testing Target Validation Computation")
        validation_response = requests.post(
            "http://localhost:5000/api/target-validation", 
            json=test_params,
            timeout=10
        )
        
        if validation_response.status_code == 200:
            results = validation_response.json()
            
            if results['success']:
                r = results['results']
                checks = results['targetChecks']
                
                print(f"   ✓ Computation successful")
                print(f"   Duty factor: {r['dutyFactor']*100:.2f}% (target: 1%)")
                print(f"   Effective duty: {r['effectiveDuty']*1e6:.1f} ppm (target: 25 ppm)")
                print(f"   Total exotic mass: {r['totalExoticMass']:.1f} kg (target: 1400 kg)")
                print(f"   Average power: {r['averagePower']/1e6:.0f} MW (target: 83 MW)")
                print(f"   Quantum safety (ζ): {r['zetaMargin']:.3f} (target: < 1.0)")
                
                # Validation checks
                print("\n3. Target Validation Checks")
                print(f"   Mass target check: {'✓ PASS' if checks['massTarget'] else '✗ FAIL'}")
                print(f"   Power target check: {'✓ PASS' if checks['powerTarget'] else '✗ FAIL'}")
                print(f"   Quantum safety check: {'✓ PASS' if checks['zetaTarget'] else '✗ FAIL'}")
                print(f"   Overall status: {'✓ ALL TARGETS MET' if checks['overallStatus'] else '⚠ TARGETS MISSED'}")
                
                return checks['overallStatus']
            else:
                print(f"   ✗ Computation failed")
                return False
        else:
            print(f"   ✗ API request failed: {validation_response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ✗ Test failed with error: {e}")
        return False

def test_needle_hull_preset_validation():
    """Test validation using Needle Hull preset parameters"""
    
    print("\n" + "=" * 80)
    print("NEEDLE HULL PRESET VALIDATION")
    print("Testing theoretical warp bubble parameters")
    print("=" * 80)
    
    # Needle Hull preset parameters from research paper
    needle_hull_params = {
        "gapA": 1e-9,          # 1 nm vacuum gap
        "tileRadius": 20e-6,   # 20 μm radius (40 μm aperture)
        "sagDepth": 16e-9,     # 16 nm sag depth
        "gammaGeo": 25,        # geometry amplification
        "strokeAmp": 50e-12,   # ±50 pm stroke
        "f_m": 15e9,          # 15 GHz modulation
        "Q_i": 1e9,           # superconducting Q
        "t_burst": 10e-6,     # 10 μs burst
        "t_cycle": 1e-3,      # 1 ms cycle
        "S": 400              # 400-sector strobing
    }
    
    try:
        response = requests.post(
            "http://localhost:5000/api/target-validation", 
            json=needle_hull_params,
            timeout=10
        )
        
        if response.status_code == 200:
            results = response.json()
            
            if results['success']:
                r = results['results']
                checks = results['targetChecks']
                
                print(f"   Enhanced energy per tile: {r['energyPerTileCycleAvg']:.2e} J")
                print(f"   Exotic mass per tile: {r['exoticMassPerTile']:.2e} kg")
                print(f"   Total lattice exotic mass: {r['totalExoticMass']:.1f} kg")
                print(f"   Van den Broeck compliance: {'✓' if checks['massTarget'] else '✗'}")
                
                return checks['massTarget']  # Focus on mass target for warp bubble
            else:
                print(f"   ✗ Needle Hull validation failed")
                return False
        else:
            print(f"   ✗ API request failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ✗ Test failed with error: {e}")
        return False

if __name__ == "__main__":
    success1 = test_target_validation_api()
    success2 = test_needle_hull_preset_validation()
    
    print("\n" + "=" * 80)
    print("TARGET VALIDATION TEST SUMMARY")
    print("=" * 80)
    print(f"   Standard validation: {'✓ PASS' if success1 else '✗ FAIL'}")
    print(f"   Needle Hull validation: {'✓ PASS' if success2 else '✗ FAIL'}")
    
    if success1 and success2:
        print("   🎯 Target-value ledger verification SUCCESSFUL")
        exit(0)
    else:
        print("   ⚠️ Target-value ledger needs adjustment")
        exit(1)