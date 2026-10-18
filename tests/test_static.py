"""
Unit tests for static Casimir calculations
Tests against analytic formulas to ensure accuracy
"""
import numpy as np
import json
import requests
import time

# Physical constants
HC = 1.98644586e-25  # [J·m] (ℏc)
PI2 = np.pi**2

def test_parallel_plate_analytic():
    """Test parallel plate calculation against analytic formula"""
    # Analytic plate-plate energy: ΔE = −π²ℏc A / (720 a³)
    radius_m = 0.025  # 25 mm radius
    A = np.pi * (radius_m)**2  # area [m²]
    gap_nm = 1.0  # 1 nm gap
    gap_m = gap_nm * 1e-9  # convert to meters
    
    E_analytic = -(PI2 * HC * A) / (720 * gap_m**3)
    
    # Run simulation via API
    simulation_params = {
        "geometry": "parallel_plate",
        "gap": gap_nm,
        "radius": radius_m * 1e6,  # convert to µm for API
        "material": "PEC",
        "temperature": 20,
        "moduleType": "static"
    }
    
    # Create simulation
    response = requests.post("http://localhost:5000/api/simulations", 
                           json=simulation_params)
    sim_data = response.json()
    sim_id = sim_data["id"]
    
    # Start simulation
    requests.post(f"http://localhost:5000/api/simulations/{sim_id}/start")
    
    # Wait for completion
    for _ in range(30):  # 30 second timeout
        response = requests.get(f"http://localhost:5000/api/simulations/{sim_id}")
        sim_result = response.json()
        if sim_result["status"] == "completed":
            break
        time.sleep(1)
    
    # Check results
    assert sim_result["status"] == "completed", "Simulation failed to complete"
    E_numeric = sim_result["results"]["totalEnergy"]
    
    # Allow 10% tolerance for numerical differences
    relative_error = abs((E_numeric - E_analytic) / E_analytic)
    assert relative_error < 0.10, f"Energy mismatch: {E_numeric} vs {E_analytic} (error: {relative_error:.1%})"
    
    print(f"✓ Parallel plate test passed: {E_numeric:.3e} J (analytic: {E_analytic:.3e} J)")
    return True

def test_gap_scaling():
    """Test that energy scales as 1/a³ for different gaps"""
    gaps = [1.0, 2.0]  # nm
    energies = []
    
    for gap in gaps:
        simulation_params = {
            "geometry": "parallel_plate",
            "gap": gap,
            "radius": 25000,  # 25 mm in µm
            "material": "PEC",
            "temperature": 20,
            "moduleType": "static"
        }
        
        response = requests.post("http://localhost:5000/api/simulations", 
                               json=simulation_params)
        sim_data = response.json()
        sim_id = sim_data["id"]
        
        requests.post(f"http://localhost:5000/api/simulations/{sim_id}/start")
        
        # Wait for completion
        for _ in range(30):
            response = requests.get(f"http://localhost:5000/api/simulations/{sim_id}")
            sim_result = response.json()
            if sim_result["status"] == "completed":
                break
            time.sleep(1)
        
        energies.append(sim_result["results"]["totalEnergy"])
    
    # Check scaling: E₁/E₂ ≈ (a₂/a₁)³
    expected_ratio = (gaps[1] / gaps[0])**3  # Should be 8 for 2nm/1nm
    actual_ratio = energies[0] / energies[1]
    
    relative_error = abs((actual_ratio - expected_ratio) / expected_ratio)
    assert relative_error < 0.15, f"Gap scaling failed: ratio {actual_ratio:.2f} vs expected {expected_ratio:.2f}"
    
    print(f"✓ Gap scaling test passed: ratio {actual_ratio:.2f} (expected: {expected_ratio:.2f})")
    return True

if __name__ == "__main__":
    print("Running static Casimir tests...")
    test_parallel_plate_analytic()
    test_gap_scaling()
    print("All static tests passed!")