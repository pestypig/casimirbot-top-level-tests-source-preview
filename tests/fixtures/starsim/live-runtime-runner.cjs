const fs = require("node:fs");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});

process.stdin.on("end", () => {
  const payload = raw.trim() ? JSON.parse(raw) : {};
  if (payload.probe) {
    process.stdout.write(JSON.stringify({ ok: true }) + "\n");
    return;
  }

  const canonical = payload.canonical_observables || {};
  const spectroscopy = canonical.spectroscopy || {};
  const structureFields = canonical.structure || {};
  const seismology = canonical.asteroseismology || {};
  const benchmarkCaseId = payload.benchmark_case_id || null;
  const benchmarkPackId = payload.benchmark_pack_id || null;
  const fitProfileId = payload.fit_profile_id || null;
  const supportedDomain = payload.supported_domain || null;
  const physicsFlags = payload.physics_flags || {};
  const forceValidationFail = physicsFlags.force_validation_fail === true;
  const liveSolverMetadata = {
    runner: "tests/fixtures/starsim/live-runtime-runner.cjs",
    benchmark_case_id: benchmarkCaseId,
    benchmark_pack_id: benchmarkPackId,
    fit_profile_id: fitProfileId,
  };

  const teff = typeof spectroscopy.teff_K?.value === "number" ? spectroscopy.teff_K.value : 5772;
  const logg = typeof spectroscopy.logg_cgs?.value === "number" ? spectroscopy.logg_cgs.value : 4.438;
  const feh = typeof spectroscopy.metallicity_feh?.value === "number" ? spectroscopy.metallicity_feh.value : 0;
  const mass = typeof structureFields.mass_Msun?.value === "number" ? structureFields.mass_Msun.value : 1.02;
  const radius = typeof structureFields.radius_Rsun?.value === "number" ? structureFields.radius_Rsun.value : 1.01;
  const numax = typeof seismology.numax_uHz?.value === "number" ? seismology.numax_uHz.value : 3090;
  const deltanu = typeof seismology.deltanu_uHz?.value === "number" ? seismology.deltanu_uHz.value : 135.1;
  const modeCount = typeof seismology.mode_count?.value === "number" ? seismology.mode_count.value : 3;

  if (payload.lane_id === "structure_mesa") {
    const structure = forceValidationFail
      ? {
          mass_Msun: mass + 0.28,
          radius_Rsun: radius + 0.24,
          age_Gyr: 4.57,
          metallicity_feh: feh + 0.45,
        }
      : {
          mass_Msun: mass + 0.01,
          radius_Rsun: radius + 0.01,
          age_Gyr: 4.57,
          metallicity_feh: feh,
        };
    const synthetic = forceValidationFail
      ? {
          teff_K: teff + 320,
          logg_cgs: logg - 0.35,
          luminosity_Lsun: 1.12,
        }
      : {
          teff_K: teff + 4,
          logg_cgs: logg,
          luminosity_Lsun: 1.0,
        };
    const residuals = {
      teff_K: forceValidationFail ? 3.2 : 0.18,
      radius_Rsun: forceValidationFail ? 2.7 : 0.09,
      metallicity_feh: forceValidationFail ? 2.1 : 0.05,
    };

    const response = {
      schema_version: "star-sim-runtime-result/1",
      execution_mode: "live_fit",
      live_solver: true,
      solver_version: "mesa.live-benchmark/1",
      benchmark_case_id: benchmarkCaseId,
      benchmark_pack_id: benchmarkPackId,
      fit_profile_id: fitProfileId,
      fit_status: "fit_completed",
      used_seismic_constraints: typeof seismology.numax_uHz?.value === "number" || typeof seismology.deltanu_uHz?.value === "number",
      evidence_fit: forceValidationFail ? 0.61 : 0.97,
      structure_summary: structure,
      synthetic_observables: synthetic,
      fit_summary: {
        profile_id: fitProfileId || "solar_like_observable_fit_v1",
        free_parameters: ["mass_Msun", "age_Gyr", "metallicity_feh", "helium_fraction", "mixing_length_alpha"],
        fixed_priors: {
          helium_prior: payload.fit_constraints?.helium_prior || "solar_scaled",
        },
        applied_constraints: payload.fit_constraints || {},
        metrics: residuals,
        note: "Live runtime test shim for constrained solar-like fits.",
      },
      supported_domain: supportedDomain,
      inferred_params: {
        mixing_length_alpha: 1.92,
        initial_helium_fraction: 0.27,
      },
      residuals_sigma: residuals,
      domain_validity: {
        benchmark_scope_only: Boolean(benchmarkCaseId),
        fit_scope: "solar_like_supported_domain",
        runner_mode: "live_fixture_protocol",
      },
      artifact_payloads: [
        {
          kind: "solver_metadata",
          file_name: "mesa-live-metadata.json",
          content_encoding: "utf8",
          content: JSON.stringify(liveSolverMetadata, null, 2) + "\n",
          media_type: "application/json",
        },
        {
          kind: "model_artifact",
          file_name: "model.gsm.h5.manifest.json",
          content_encoding: "utf8",
          content:
            JSON.stringify(
              {
                kind: "gsm_hdf5_manifest",
                benchmark_case_id: benchmarkCaseId,
                benchmark_pack_id: benchmarkPackId,
                fit_profile_id: fitProfileId,
                cache_key: payload.cache_key,
              },
              null,
              2,
            ) + "\n",
          media_type: "application/json",
        },
      ],
      live_solver_metadata: liveSolverMetadata,
    };
    process.stdout.write(JSON.stringify(response) + "\n");
    return;
  }

  const modeSummary = forceValidationFail
    ? {
        numax_uHz: numax + 260,
        deltanu_uHz: deltanu - 14,
        mode_count: Math.max(modeCount + 3, 6),
      }
    : {
        numax_uHz: numax + 1.2,
        deltanu_uHz: deltanu + 0.1,
        mode_count: modeCount,
      };
  const residuals = {
    mode_frequency_uHz: forceValidationFail ? 5.7 : 0.14,
    deltanu_uHz: forceValidationFail ? 2.3 : 0.08,
  };

  const response = {
    schema_version: "star-sim-runtime-result/1",
    execution_mode: "live_comparison",
    live_solver: true,
    solver_version: "gyre.live-benchmark/1",
    benchmark_case_id: benchmarkCaseId,
    benchmark_pack_id: benchmarkPackId,
    fit_profile_id: fitProfileId,
    fit_status: "comparison_completed",
    evidence_fit: forceValidationFail ? 0.58 : 0.96,
    mode_summary: modeSummary,
    comparison_summary: {
      profile_id: fitProfileId || "solar_like_seismic_compare_v1",
      checked_observables: ["asteroseismology.numax_uHz", "asteroseismology.deltanu_uHz", "asteroseismology.mode_count"],
      coverage: 1,
      metrics: residuals,
      note: "Live runtime test shim for constrained solar-like seismic comparisons.",
    },
    seismic_match_summary: {
      used_observables: ["asteroseismology.numax_uHz", "asteroseismology.deltanu_uHz", "asteroseismology.mode_count"],
      matched_mode_count: modeSummary.mode_count,
      available_mode_count: modeCount,
    },
    supported_domain: supportedDomain,
    inferred_params: {
      dominant_l: 0,
      dominant_n: 18,
    },
    residuals_sigma: residuals,
    domain_validity: {
      benchmark_scope_only: Boolean(benchmarkCaseId),
      fit_scope: "solar_like_supported_domain",
      runner_mode: "live_fixture_protocol",
    },
    artifact_payloads: [
      {
        kind: "solver_metadata",
        file_name: "gyre-live-metadata.json",
        content_encoding: "utf8",
        content: JSON.stringify(liveSolverMetadata, null, 2) + "\n",
        media_type: "application/json",
      },
      {
        kind: "mode_table",
        file_name: "mode-table.json",
        content_encoding: "utf8",
          content:
            JSON.stringify(
              {
                benchmark_case_id: benchmarkCaseId,
                benchmark_pack_id: benchmarkPackId,
                modes: forceValidationFail ? [3330.1, 3400.4] : [3090.0, 3160.4, 3232.1],
              },
              null,
            2,
          ) + "\n",
        media_type: "application/json",
      },
    ],
    live_solver_metadata: liveSolverMetadata,
  };
  process.stdout.write(JSON.stringify(response) + "\n");
});
