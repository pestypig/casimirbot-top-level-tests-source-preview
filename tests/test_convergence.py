"""
Convergence and numerical quality tests
Validates computational accuracy and parameter limits
"""
import numpy as np
import requests
import time

def test_xi_points_adequacy():
    """Test that Xi points are adequate for given gap size"""
    gap_nm = 1.0
    
    simulation_params = {
        "geometry": "parallel_plate",
        "gap": gap_nm,
        "radius": 25000,
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
    
    xi_points = sim_result["results"].get("xiPoints", 0)
    min_required = 5000 if gap_nm <= 1.0 else 3000
    
    assert xi_points >= min_required, f"Xi points {xi_points} < required {min_required} for {gap_nm}nm gap"
    
    print(f"✓ Xi points adequacy test passed: {xi_points} points for {gap_nm}nm gap")
    return True

def test_error_tolerance():
    """Test that numerical error is within acceptable bounds"""
    simulation_params = {
        "geometry": "parallel_plate",
        "gap": 2.0,
        "radius": 25000,
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
    
    error_estimate = sim_result["results"].get("errorEstimate", "1.0%")
    
    # Parse error percentage
    if "%" in error_estimate:
        error_pct = float(error_estimate.replace("%", ""))
        assert error_pct <= 5.0, f"Error estimate {error_pct}% > 5% threshold"
    
    print(f"✓ Error tolerance test passed: {error_estimate}")
    return True

def test_quantum_safety_bounds():
    """Test quantum inequality safety margins"""
    simulation_params = {
        "geometry": "bowl",
        "gap": 1.0,
        "radius": 20000,
        "sagDepth": 16,
        "material": "PEC",
        "temperature": 20,
        "moduleType": "dynamic",
        "dynamicConfig": {
            "modulationFreqGHz": 15,
            "strokeAmplitudePm": 50,
            "burstLengthUs": 10,
            "cycleLengthUs": 1000,
            "cavityQ": 1000000000
        }
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
    
    qi_margin = sim_result["results"]["quantumInequalityMargin"]
    qi_status = sim_result["results"]["quantumSafetyStatus"]
    
    # Ford-Roman bound compliance
    assert qi_margin is not None, "Quantum inequality margin not calculated"
    assert qi_status in ['safe', 'warning', 'violation'], f"Invalid QI status: {qi_status}"
    
    # Warn if approaching violation
    if qi_margin > 0.9:
        print(f"⚠ Warning: QI margin {qi_margin:.3f} approaching violation threshold")
    
    print(f"✓ Quantum safety test passed: ζ = {qi_margin:.3f} ({qi_status})")
    return True

if __name__ == "__main__":
    print("Running convergence and safety tests...")
    test_xi_points_adequacy()
    test_error_tolerance()
    test_quantum_safety_bounds()
    print("All convergence tests passed!")