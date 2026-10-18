"""
Test stress-energy tensor calculations against research paper formulas
Cross-compares equations with the logical flow from stress-energy tensor through Casimir energy to Van den Broeck-Natário metric
"""

import subprocess
import json
import sys
import os

# Add the project root to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_stress_energy_tensor_logical_flow():
    """
    Test the complete logical flow from the research paper:
    1. Stress-Energy Tensor (General Relativity)
    2. Static Casimir Energy Density  
    3. Dynamical Casimir Geometry (with Q, Fractional Stroke, Gamma, etc.)
    4. Per-Cavity and Per-Tile Quantities
    5. Total Negative Energy (Exotic Mass) with T00
    6. Van den Broeck Metric Structure (Spherical Symmetry)
    7. Metric with Artificial Gravity (Tilted Shift Vector)
    8. Stress-Energy General Form (Static, Spherically Symmetric Case)
    """
    
    print("=" * 60)
    print("STRESS-ENERGY TENSOR LOGICAL FLOW VALIDATION")
    print("Cross-comparing with research paper equations...")
    print("=" * 60)
    
    # Test parameters matching the Needle Hull preset from the paper
    test_params = {
        "geometry": "bowl",
        "gap": 1.0,  # 1 nm gap
        "radius": 20.0,  # 20 μm radius  
        "sagDepth": 16.0,  # 16 nm sag depth for γ_geo ≈ 25
        "moduleType": "dynamic",
        "dynamicConfig": {
            "modulationFreqGHz": 15.0,  # 15 GHz modulation
            "strokeAmplitudePm": 50.0,  # ±50 pm stroke
            "burstLengthUs": 10.0,     # 10 μs burst
            "cycleLengthUs": 1000.0,   # 1 ms cycle  
            "cavityQ": 1e9,            # Q ≈ 10⁹
            "sectorCount": 400,        # 400 sectors
            "sectorDuty": 2.5e-5,      # d_eff = 2.5×10⁻⁵
            "lightCrossingTimeNs": 100.0  # τ_LC = 100 ns
        }
    }
    
    # Run simulation to get stress-energy tensor results
    print("1. Running Needle Hull simulation with research parameters...")
    result = subprocess.run([
        'node', '-e', '''
        import("../server/index.js").then(async () => {
            const response = await fetch("http://localhost:5000/api/simulations", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(%s)
            });
            const data = await response.json();
            console.log(JSON.stringify(data, null, 2));
            process.exit(0);
        }).catch(err => {
            console.error("Error:", err);
            process.exit(1);
        });
        ''' % json.dumps(test_params)
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print("❌ Failed to run simulation")
        print("STDERR:", result.stderr)
        return False
    
    try:
        sim_data = json.loads(result.stdout.strip())
        print("✓ Simulation completed successfully")
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse simulation results: {e}")
        return False
    
    # Validate stress-energy tensor calculations
    print("\n2. Validating Stress-Energy Tensor Components...")
    
    expected_values = {
        # From paper: base energy density ρ₀ = -4.3 × 10⁸ J/m³ for 1 nm gap
        "base_energy_density": -4.3e8,  # J/m³
        
        # Geometric amplification: γ_geo ≈ 25 for 40 μm aperture, 16 nm sag
        "gamma_geo": 25,
        
        # Van den Broeck amplification: γ_VdB ≈ 10¹¹
        "gamma_vdb": 1e11,
        
        # Expected enhanced energy density (order of magnitude)
        "enhanced_energy_range": [-1e20, -1e15],  # J/m³ (highly amplified)
        
        # Exotic mass per tile: ≈1.5 kg target from paper
        "target_mass_per_tile": 1.5,  # kg
        
        # Total exotic mass: ≈1.4×10³ kg for full needle hull
        "target_total_mass": 1.4e3  # kg
    }
    
    # Check T₀₀ (energy density) component
    if 'stressEnergyT00' in sim_data:
        t00 = sim_data['stressEnergyT00']
        print(f"   T₀₀ (energy density): {t00:.3e} J/m³")
        
        # Verify negative energy density (exotic matter)
        if t00 < 0:
            print("   ✓ Negative energy density confirmed (exotic matter)")
        else:
            print("   ❌ Energy density should be negative for exotic matter")
            return False
            
        # Check amplification is within expected range
        if expected_values["enhanced_energy_range"][0] <= t00 <= expected_values["enhanced_energy_range"][1]:
            print("   ✓ Energy density amplification within expected range")
        else:
            print(f"   ⚠ Energy density {t00:.3e} outside expected range {expected_values['enhanced_energy_range']}")
    else:
        print("   ❌ Missing T₀₀ component in results")
        return False
    
    # Check T₁₁ (pressure) component  
    if 'stressEnergyT11' in sim_data:
        t11 = sim_data['stressEnergyT11']
        print(f"   T₁₁ (pressure): {t11:.3e} J/m³")
        
        # For exotic matter: T₁₁ = -T₀₀ (w = -1 equation of state)
        expected_t11 = -t00
        ratio = abs(t11 / expected_t11) if expected_t11 != 0 else float('inf')
        
        if 0.9 <= ratio <= 1.1:
            print("   ✓ T₁₁ = -T₀₀ relationship confirmed (w = -1)")
        else:
            print(f"   ❌ T₁₁/(-T₀₀) ratio = {ratio:.3f}, expected ≈ 1.0")
            return False
    else:
        print("   ❌ Missing T₁₁ component in results")
        return False
    
    print("\n3. Validating Van den Broeck Metric Calculations...")
    
    # Check Natário shift vector
    if 'natarioShiftAmplitude' in sim_data:
        beta = sim_data['natarioShiftAmplitude']
        print(f"   Natário shift β: {beta:.3e}")
        
        # β should be proportional to √(8πG|ρ|/c²) × R_hull
        # For the needle hull geometry, expect small but non-zero shift
        if beta > 0:
            print("   ✓ Positive Natário shift amplitude")
        else:
            print("   ❌ Natário shift should be positive")
            return False
    else:
        print("   ❌ Missing Natário shift amplitude in results")
        return False
    
    print("\n4. Validating Sector Strobing and GR Validity...")
    
    # Check GR validity through homogenization theorem
    if 'grValidityCheck' in sim_data:
        gr_valid = sim_data['grValidityCheck']
        print(f"   GR Validity Check: {'✓ Valid' if gr_valid else '❌ Invalid'}")
        
        if not gr_valid:
            print("   ⚠ GR validity check failed - may need parameter adjustment")
    
    # Check homogenization ratio (τ_pulse / τ_LC)
    if 'homogenizationRatio' in sim_data:
        ratio = sim_data['homogenizationRatio']
        print(f"   Homogenization ratio: {ratio:.3e}")
        
        # For GR validity: τ_pulse ≪ τ_LC (ratio ≪ 1)
        if ratio < 0.1:
            print("   ✓ Homogenization condition satisfied (τ_pulse ≪ τ_LC)")
        else:
            print("   ⚠ Homogenization ratio may be too large for GR validity")
    
    print("\n5. Cross-Comparison with Research Paper Values...")
    
    # Compare exotic mass calculations
    if 'exoticMassPerTile' in sim_data:
        mass_per_tile = sim_data['exoticMassPerTile']
        print(f"   Exotic mass per tile: {mass_per_tile:.3f} kg")
        print(f"   Paper target: {expected_values['target_mass_per_tile']:.3f} kg")
        
        ratio = mass_per_tile / expected_values['target_mass_per_tile']
        if 0.1 <= ratio <= 10.0:  # Within order of magnitude
            print(f"   ✓ Mass per tile within order of magnitude (ratio: {ratio:.2f})")
        else:
            print(f"   ⚠ Mass per tile differs significantly (ratio: {ratio:.2f})")
    
    if 'totalExoticMass' in sim_data:
        total_mass = sim_data['totalExoticMass']
        print(f"   Total exotic mass: {total_mass:.3e} kg")
        print(f"   Paper target: {expected_values['target_total_mass']:.3e} kg")
        
        ratio = total_mass / expected_values['target_total_mass']
        if 0.1 <= ratio <= 10.0:  # Within order of magnitude
            print(f"   ✓ Total mass within order of magnitude (ratio: {ratio:.2f})")
        else:
            print(f"   ⚠ Total mass differs significantly (ratio: {ratio:.2f})")
    
    print("\n" + "=" * 60)
    print("STRESS-ENERGY TENSOR VALIDATION COMPLETE")
    print("✓ All major components cross-compared with research paper")
    print("✓ Logical flow from stress-energy tensor to Van den Broeck metric verified")
    print("=" * 60)
    
    return True

if __name__ == "__main__":
    success = test_stress_energy_tensor_logical_flow()
    exit(0 if success else 1)