import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_BINDING,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_CANONICAL_JSON,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_CANONICAL_SIZE_BYTES,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_EXPECTED_CANONICAL_SIZE_BYTES,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_EXPECTED_SHA256,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_SHA256,
  NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_SHA256_DOMAIN,
  isNhm2SphericalBosonStarV2MetricDemandProgramV1,
  nhm2SphericalBosonStarV2MetricDemandProgramViolations,
} from "../shared/contracts/nhm2-spherical-boson-star-v2-metric-demand-program.v1";

const contract = NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM;

describe("NHM2 spherical boson-star v2 metric-demand program", () => {
  it("literal-seals the exact canonical policy bytes", () => {
    const digest = createHash("sha256")
      .update(
        NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_SHA256_DOMAIN,
        "utf8",
      )
      .update(
        NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_CANONICAL_JSON,
        "utf8",
      )
      .digest("hex");
    expect(digest).toBe(
      NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_SHA256,
    );
    expect(digest).toBe(
      NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_EXPECTED_SHA256,
    );
    expect(
      NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_CANONICAL_SIZE_BYTES,
    ).toBe(
      NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_EXPECTED_CANONICAL_SIZE_BYTES,
    );
    expect(
      NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_BINDING,
    ).toMatchObject({
      sha256: digest,
      canonicalSizeBytes:
        NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_CANONICAL_SIZE_BYTES,
    });
  });

  it("binds every upstream definition used by the program", () => {
    expect(contract.exactBindings.sourceCandidatePlan).toMatchObject({
      sha256:
        "9aecb482ee5e78c61b202966c44a25139262f139cb06654094e7e36956e4876d",
      canonicalSizeBytes: 93_214,
    });
    expect(contract.exactBindings.v2CandidateFreeze).toMatchObject({
      sha256:
        "628092507b7dc1be76722f06a7b591efc59d1799bed0d4b7d1999d852d92f28f",
      canonicalSizeBytes: 55_997,
    });
    expect(contract.exactBindings.branchBvp).toMatchObject({
      sha256:
        "ce00d2b6048d8c22e6dedd4526a8548373916525ef9adb75fcea48e67dc7e557",
      canonicalSizeBytes: 13_847,
    });
    expect(contract.exactBindings.radialPrimaryNumerics).toMatchObject({
      sha256:
        "f88e31544dfeccdbb43a5b956172c4b6b4b84f22de3b25ced762282cb5f271bc",
      canonicalSizeBytes: 14_732,
    });
    expect(contract.exactBindings.branchExecutionPolicy).toMatchObject({
      sha256:
        "55238947c0a21f71ff3b0b28d095733376527479214806790990aea4317b7cf8",
      canonicalSizeBytes: 21_266,
    });
    expect(contract.exactBindings.siOutputNormalization).toMatchObject({
      sha256:
        "16224114ce7bc790d1e5ceeaf8f75e31e5c37412856c5bea8b99284301bf3c24",
      canonicalSizeBytes: 23_822,
    });
  });

  it("freezes all 64 samples into the four exact nonzero radius groups", () => {
    const sample = contract.sampleBoundary;
    expect(sample.sampleCount).toBe(64);
    expect(sample.originSamplePresent).toBe(false);
    expect(sample.projectionBySample).toHaveLength(64);
    expect(sample.projectionBySample.map((entry) => entry.ordinal)).toEqual(
      Array.from({ length: 64 }, (_, ordinal) => ordinal),
    );
    expect(
      sample.radiusGroups.map((entry) => [
        entry.radiusSquaredExact,
        entry.sampleOrdinals.length,
      ]),
    ).toEqual([
      ["3/64", 8],
      ["11/64", 24],
      ["19/64", 24],
      ["27/64", 8],
    ]);
    expect(sample.projectionBySample[0]).toMatchObject({
      ordinal: 0,
      radiusSquaredExact: "27/64",
      unitRadialVectorExact: {
        nx: "-3/sqrt(27)",
        ny: "-3/sqrt(27)",
        nz: "-3/sqrt(27)",
      },
    });
    expect(sample.projectionBySample[63]).toMatchObject({
      ordinal: 63,
      radiusSquaredExact: "27/64",
      unitRadialVectorExact: {
        nx: "3/sqrt(27)",
        ny: "3/sqrt(27)",
        nz: "3/sqrt(27)",
      },
    });
  });

  it("freezes the exact mixed-to-orthonormal sign and Cartesian projection", () => {
    expect(contract.dimensionlessEinsteinProgram.sourceMixedComponents).toEqual(
      {
        Gbar_t_t: "exp(-2*F1)*(2*F1_double_prime+F1_prime^2+4*F1_prime/x)",
        Gbar_x_x:
          "exp(-2*F1)*(2*F0_prime*F1_prime+F1_prime^2+2*(F0_prime+F1_prime)/x)",
        Gbar_theta_theta:
          "exp(-2*F1)*(F0_prime^2+F0_double_prime+F1_double_prime+(F0_prime+F1_prime)/x)",
      },
    );
    expect(
      contract.dimensionlessEinsteinProgram.orthonormalCovariantScalars,
    ).toEqual({
      rhoBar: "-Gbar_t_t",
      radialPressureBar: "Gbar_x_x",
      tangentialPressureBar: "Gbar_theta_theta=Gbar_phi_phi",
    });
    expect(
      contract.dimensionlessEinsteinProgram.cartesianProjection,
    ).toMatchObject({
      timeSpaceComponents: "Gbar_hat0hati=positive_zero",
      spatialFormula:
        "Gbar_hatihatj=pTangentialBar*delta_ij+(pRadialBar-pTangentialBar)*n_i*n_j",
      componentOrder: [
        "00",
        "01",
        "02",
        "03",
        "11",
        "12",
        "13",
        "22",
        "23",
        "33",
      ],
    });
  });

  it("centers the deterministic enclosure on the serialized f64 byte", () => {
    expect(contract.intervalAndSerializationProgram).toMatchObject({
      precisionBits: 256,
      centralRounding: "MPFR_RNDN",
      lowerRounding: "MPFR_RNDD",
      upperRounding: "MPFR_RNDU",
      pairedOutputRoles: [
        "metric_demand_tensor",
        "metric_demand_absolute_error_bound",
      ],
      elementCountPerRole: 640,
      centralSizeBytes: 5_120,
      errorSizeBytes: 5_120,
      terminalByteEnclosurePostcondition:
        "u_f64>=max(abs(lower_exact-c_f64_exact),abs(upper_exact-c_f64_exact))",
      binary64OrJavaScriptNumberIntermediateAllowed: false,
    });
    expect(
      contract.intervalAndSerializationProgram.directedEnclosureChronology,
    ).toEqual([
      "construct_independent_RNDD_and_RNDU_radius_and_unit_vector_endpoints",
      "evaluate_each_formula_with_outward_interval_primitives_and_no_reassociation",
      "project_each_cartesian_component_with_outward_interval_arithmetic",
      "multiply_by_the_verified_stressScaleAdmissionK2_interval",
      "require_the_reinjected_serialized_central_f64_inside_the_final_hull",
      "compute_RNDU_distances_from_the_serialized_central_f64_to_both_hull_endpoints",
      "select_the_larger_distance",
      "perform_exactly_one_terminal_mpfr_get_d_RNDU_for_the_paired_error_element",
      "reinject_the_error_f64_and_require_it_enclose_both_byte_centered_distances",
    ]);
  });

  it("freezes one canonical endpoint wire with f64-central identity", () => {
    const graph =
      contract.intervalAndSerializationProgram.primitiveOperationGraph;
    expect(graph.graphId).toBe(
      "nhm2_spherical_boson_star_v2_metric_demand_mpfr256_primitive_ast/v1",
    );
    expect(graph.inputInterchange.canonicalJsonWire).toEqual({
      contractVersion:
        "nhm2_semiclassical_v2_spherical_boson_star_metric_demand_mpfr256_input/v1",
      encoding: "UTF-8_without_BOM",
      whitespaceAllowedOutsideStrings: false,
      objectKeyOrder: "ascending_unsigned_UTF8_byte_order",
      stringEncoding:
        "all_schema_tokens_hex_and_decimal_strings_are_unescaped_ASCII_and_all_other_strings_use_shortest_required_JSON_escapes",
      numberEncoding:
        "precisionBits_is_the_only_JSON_number_in_an_endpoint_and_is_exactly_the_unquoted_token_256",
      duplicateObjectKeysAllowed: false,
      arraysPreserveDeclaredOrder: true,
      extraFieldsAllowed: false,
    });
    expect(graph.inputInterchange.geometryQuantityRecordFields).toEqual([
      "quantityId",
      "centralF64WordHex",
      "centralMpfr256",
      "lowerMpfr256",
      "upperMpfr256",
    ]);
    expect(graph.inputInterchange.quantityOrder).toEqual([
      "F1",
      "F0_prime",
      "F1_prime",
      "F0_double_prime",
      "F1_double_prime",
    ]);
    expect(
      graph.inputInterchange.endpointObjectFieldsInValidationOrder,
    ).toEqual([
      "sign",
      "mantissaHex",
      "exponent2",
      "precisionBits",
      "direction",
    ]);
    expect(graph.inputInterchange.endpointFieldDomains).toEqual({
      sign: ["positive_zero", "plus", "minus"],
      mantissaHex:
        "lowercase_[0-9a-f]+_with_no_leading_zero_except_the_single_token_0",
      exponent2:
        "JSON_string_canonical_decimal_0_or_minus_nonzero_digits_or_nonzero_digits_with_no_plus_sign_and_no_leading_zero",
      precisionBits: "JSON_integer_exactly_256",
      direction: ["MPFR_RNDN", "MPFR_RNDD", "MPFR_RNDU"],
    });
    expect(graph.inputInterchange.uniqueNormalizedDyadicRule).toMatchObject({
      positiveZero: "sign_positive_zero_requires_mantissaHex_0_and_exponent2_0",
      nonzero:
        "sign_plus_or_minus_requires_nonzero_odd_mantissa_with_bit_length_1_through_256",
      exponentRepresentability:
        "for_nonzero_mantissa_bit_length_b_require_minus_1000000<=exponent2+b<=plus_1000000",
    });
    expect(graph.inputInterchange.centralF64Identity).toEqual({
      wordGrammar:
        "exactly_16_lowercase_hex_digits_encoding_the_host_independent_unsigned_IEEE754_binary64_bit_word",
      finiteRequired: true,
      negativeZeroAllowed: false,
      exactDecomposition:
        "decode_the_finite_word;for_zero_require_the_unique_positive_zero_endpoint;otherwise_form_the_exact_integer_significand_and_binary_exponent_then_remove_all_factors_of_two_until_the_mantissa_is_odd",
      equalityRequired:
        "centralMpfr256_must_equal_the_unique_normalized_dyadic_decomposition_of_centralF64WordHex_and_the_fresh_mpfr_set_d_destination_bit_exactly",
    });
    expect(graph.inputInterchange.loadProgram).toHaveLength(8);
    expect(graph.inputInterchange.loadProgram[6]).toBe(
      "07_for_geometry_C_decode_centralF64WordHex_then_write_freshCentralFromF64=mpfr_set_d(decodedFiniteF64,MPFR_RNDN)_ternary_zero_then_mpfr_cmp(freshCentralFromF64,freshSignedEndpoint)_require_zero_and_use_freshCentralFromF64_as_C",
    );
    expect(graph.inputInterchange.wireCardinality).toEqual({
      radiusGroupCount: 4,
      quantityCountPerRadiusGroup: 5,
      siScaleRecordCount: 1,
      endpointCountPerGeometryQuantity: 3,
      endpointCountPerSiScaleRecord: 3,
    });
  });

  it("freezes one radius-member-component trace and storage map", () => {
    const graph =
      contract.intervalAndSerializationProgram.primitiveOperationGraph;
    expect(graph.totalTraceOrder).toEqual([
      "01_acquire_exclusive_MPFR_context_clear_flags_save_caller_emin_then_emax_require_caller_range_contains_minus_1000000_through_plus_1000000_then_set_emin_minus_1000000_then_emax_plus_1000000",
      "02_validate_the_canonical_wire_envelope_then_load_the_global_SI_scale_C_then_L_then_U",
      "03_for_each_radius_group_in_r2_3_r2_11_r2_19_r2_27_order_load_F1_then_F0_prime_then_F1_prime_then_F0_double_prime_then_F1_double_prime_each_as_C_f64_identity_then_L_then_U",
      "04_for_each_exact_member_sample_ordinal_of_that_radius_group_in_the_frozen_member_order_construct_sample_geometry_C_then_directed_L_U",
      "05_evaluate_scalar_C_in_e_rho_pr_pt_order_then_scalar_hulls_in_e_rho_pr_pt_order",
      "06_compute_projection_diff_C_then_diff_L_U_then_visit_components_00_01_02_03_11_12_13_22_23_33",
      "07_for_each_component_execute_each_numbered_projection_stage_C_then_L_U_then_the_SI_terminal_program_then_store_at_sample_ordinal_component_ordinal",
      "08_after_all_bytes_and_observations_exist_clear_MPFR_destinations_then_MPZ_values_in_reverse_creation_order_restore_saved_emax_then_saved_emin_require_success_finalize_the_receipt_then_release_the_exclusive_MPFR_context",
    ]);
    expect(graph.loopOrder.radiusGroupOrder).toEqual([
      "r2_3_over_64",
      "r2_11_over_64",
      "r2_19_over_64",
      "r2_27_over_64",
    ]);
    expect(
      graph.loopOrder.exactSampleOrdinalsByRadiusGroup.map(
        (group) => group.sampleOrdinals,
      ),
    ).toEqual([
      [21, 22, 25, 26, 37, 38, 41, 42],
      [
        5, 6, 9, 10, 17, 18, 20, 23, 24, 27, 29, 30, 33, 34, 36, 39, 40, 43, 45,
        46, 53, 54, 57, 58,
      ],
      [
        1, 2, 4, 7, 8, 11, 13, 14, 16, 19, 28, 31, 32, 35, 44, 47, 49, 50, 52,
        55, 56, 59, 61, 62,
      ],
      [0, 3, 12, 15, 48, 51, 60, 63],
    ]);
    expect(graph.loopOrder.componentOrder).toEqual([
      "00",
      "01",
      "02",
      "03",
      "11",
      "12",
      "13",
      "22",
      "23",
      "33",
    ]);
    expect(graph.loopOrder.storageIndex).toBe(
      "byte_offset=8*(10*sample_ordinal+component_ordinal)_independent_of_radius_group_visit_order",
    );
    expect(
      contract.intervalAndSerializationProgram.exactRadiusConstruction,
    ).toBe(
      "set_ui(radius_squared_numerator);sqrt_at_C_RNDN_or_L_RNDD_or_U_RNDU;div_ui(8)_at_the_same_direction_with_distinct_single_assignment_destinations",
    );
  });

  it("freezes sign-sensitive sample geometry and scalar parenthesization", () => {
    const graph =
      contract.intervalAndSerializationProgram.primitiveOperationGraph;
    expect(graph.sampleGeometryCentralAst).toEqual([
      "01_mpfr_set_ui(qC,radiusSquaredNumerator,MPFR_RNDN)_ternary_zero",
      "02_mpfr_sqrt(sqrtQC,qC,MPFR_RNDN)",
      "03_mpfr_div_ui(xC,sqrtQC,8,MPFR_RNDN)",
      "04_mpfr_set_si(numXC,xNumerator,MPFR_RNDN)_ternary_zero",
      "05_mpfr_div(nXC,numXC,sqrtQC,MPFR_RNDN)",
      "06_mpfr_set_si(numYC,yNumerator,MPFR_RNDN)_ternary_zero",
      "07_mpfr_div(nYC,numYC,sqrtQC,MPFR_RNDN)",
      "08_mpfr_set_si(numZC,zNumerator,MPFR_RNDN)_ternary_zero",
      "09_mpfr_div(nZC,numZC,sqrtQC,MPFR_RNDN)",
    ]);
    expect(graph.sampleGeometryDirectedAst).toHaveLength(24);
    expect(graph.sampleGeometryDirectedAst.slice(6, 12)).toEqual([
      "07_mpfr_set_ui(absNumXL,abs(xNumerator),MPFR_RNDN)_ternary_zero",
      "08_mpfr_set_ui(absNumXU,abs(xNumerator),MPFR_RNDN)_ternary_zero",
      "09_mpfr_div(nAbsXL,absNumXL,sqrtQU,MPFR_RNDD)",
      "10_mpfr_div(nAbsXU,absNumXU,sqrtQL,MPFR_RNDU)",
      "11_if_xNumerator_positive_mpfr_set(nXL,nAbsXL,MPFR_RNDN)_else_mpfr_neg(nXL,nAbsXU,MPFR_RNDD)_ternary_zero",
      "12_if_xNumerator_positive_mpfr_set(nXU,nAbsXU,MPFR_RNDN)_else_mpfr_neg(nXU,nAbsXL,MPFR_RNDU)_ternary_zero",
    ]);
    expect(graph.sampleGeometryDirectedAst.slice(18, 24)).toEqual([
      "19_mpfr_set_ui(absNumZL,abs(zNumerator),MPFR_RNDN)_ternary_zero",
      "20_mpfr_set_ui(absNumZU,abs(zNumerator),MPFR_RNDN)_ternary_zero",
      "21_mpfr_div(nAbsZL,absNumZL,sqrtQU,MPFR_RNDD)",
      "22_mpfr_div(nAbsZU,absNumZU,sqrtQL,MPFR_RNDU)",
      "23_if_zNumerator_positive_mpfr_set(nZL,nAbsZL,MPFR_RNDN)_else_mpfr_neg(nZL,nAbsZU,MPFR_RNDD)_ternary_zero",
      "24_if_zNumerator_positive_mpfr_set(nZU,nAbsZU,MPFR_RNDN)_else_mpfr_neg(nZU,nAbsZL,MPFR_RNDU)_ternary_zero",
    ]);
    expect(graph.centralScalarAst.rhoBar).toEqual([
      "01_r0=mpfr_mul_ui(F1ppC,2,MPFR_RNDN)",
      "02_r1=mpfr_mul(F1pC,F1pC,MPFR_RNDN)",
      "03_r2=mpfr_mul_ui(F1pC,4,MPFR_RNDN)",
      "04_r3=mpfr_div(r2,xC,MPFR_RNDN)",
      "05_r4=mpfr_add(r0,r1,MPFR_RNDN)",
      "06_r5=mpfr_add(r4,r3,MPFR_RNDN)",
      "07_r6=mpfr_mul(eC,r5,MPFR_RNDN)",
      "08_rhoC=mpfr_neg(r6,MPFR_RNDN)_require_ternary_zero",
    ]);
    expect(graph.directedScalarAst.rhoBar).toHaveLength(8);
    expect(graph.directedScalarAst.radialPressureBar).toHaveLength(9);
    expect(graph.directedScalarAst.tangentialPressureBar).toHaveLength(7);
  });

  it("totally orders interval products and primitive observations", () => {
    const graph =
      contract.intervalAndSerializationProgram.primitiveOperationGraph;
    const multiply = graph.outwardIntervalPrimitiveTemplates.multiply;
    expect(multiply.candidateOrder).toEqual(["LL", "LU", "UL", "UU"]);
    expect(multiply.primitiveOrder).toEqual([
      "01_LL_lower=mpfr_mul(aL,bL,MPFR_RNDD)",
      "02_LU_lower=mpfr_mul(aL,bU,MPFR_RNDD)",
      "03_UL_lower=mpfr_mul(aU,bL,MPFR_RNDD)",
      "04_UU_lower=mpfr_mul(aU,bU,MPFR_RNDD)",
      "05_LL_upper=mpfr_mul(aL,bL,MPFR_RNDU)",
      "06_LU_upper=mpfr_mul(aL,bU,MPFR_RNDU)",
      "07_UL_upper=mpfr_mul(aU,bL,MPFR_RNDU)",
      "08_UU_upper=mpfr_mul(aU,bU,MPFR_RNDU)",
      "09_lower_source_starts_LL;mpfr_cmp(currentLower,LU)<=0_keep_current_else_select_LU",
      "10_mpfr_cmp(currentLower,UL)<=0_keep_current_else_select_UL",
      "11_mpfr_cmp(currentLower,UU)<=0_keep_current_else_select_UU",
      "12_upper_source_starts_LL;mpfr_cmp(currentUpper,LU)>=0_keep_current_else_select_LU",
      "13_mpfr_cmp(currentUpper,UL)>=0_keep_current_else_select_UL",
      "14_mpfr_cmp(currentUpper,UU)>=0_keep_current_else_select_UU",
      "15_outL=mpfr_set(selectedLowerSource,MPFR_RNDN)_ternary_zero",
      "16_outU=mpfr_set(selectedUpperSource,MPFR_RNDN)_ternary_zero",
    ]);
    expect(multiply.comparisonCount).toBe(6);
    const observations =
      graph.destinationAndContextPolicy.primitiveObservationProtocol;
    expect(observations.arithmeticReturningTernary).toMatchObject({
      allowedTernary: [-1, 0, 1],
      allowedFlags: ["inexact"],
      disallowedOutcome:
        "any_disallowed_flag_or_ternary_invalidates_the_trace_before_the_destination_may_be_consumed",
    });
    expect(observations.comparisonReturningSign).toMatchObject({
      normalizedComparisonSign: "minus_1_zero_or_plus_1",
      roundingModeFieldPresent: false,
      ternaryFieldPresent: false,
      allowedFlags: [],
      disallowedOutcome:
        "any_set_flag_or_noncanonical_comparison_return_invalidates_the_trace_before_branch_selection",
    });
    expect(observations.getDReturningBinary64).toMatchObject({
      ternaryFieldPresent: false,
      allowedFlags: ["inexact"],
      finiteResultRequired: true,
      disallowedOutcome:
        "any_disallowed_flag_or_nonfinite_word_invalidates_the_trace_before_word_canonicalization",
    });
  });

  it("constructs every C/L/U projection and terminal with fresh destinations", () => {
    const graph =
      contract.intervalAndSerializationProgram.primitiveOperationGraph;
    expect(graph.outwardIntervalPrimitiveTemplates.centralPositiveZero).toEqual(
      ["01_outC=mpfr_set_ui(0,MPFR_RNDN)_ternary_zero"],
    );
    expect(
      graph.outwardIntervalPrimitiveTemplates.directedPositiveZero,
    ).toEqual([
      "01_outL=mpfr_set_ui(0,MPFR_RNDN)_ternary_zero",
      "02_outU=mpfr_set_ui(0,MPFR_RNDN)_ternary_zero",
    ]);
    expect(graph.cartesianProjectionAst.timeComponent00).toEqual([
      "01_component00C=expand_centralCopy(rhoC)",
      "02_component00Hull=expand_directedCopy(rhoHull)",
    ]);
    expect(graph.cartesianProjectionAst.eachTimeSpaceComponent).toEqual([
      "01_componentC=expand_centralPositiveZero",
      "02_componentHull=expand_directedPositiveZero",
    ]);
    expect(
      graph.cartesianProjectionAst.eachSpatialComponent.slice(4, 8),
    ).toEqual([
      "05_if_diagonal_baseC=expand_centralCopy(ptC)_else_baseC=expand_centralPositiveZero",
      "06_if_diagonal_baseHull=expand_directedCopy(ptHull)_else_baseHull=expand_directedPositiveZero",
      "07_componentC=mpfr_add(baseC,corrC,MPFR_RNDN)",
      "08_componentHull=expand_add(baseHull,corrHull)",
    ]);
    expect(graph.siAndTerminalAst).toHaveLength(20);
    expect(graph.siAndTerminalAst[1]).toContain("cSiCanonical");
    expect(graph.siAndTerminalAst[2]).toContain(
      "mpfr_get_d(cSiCanonical,MPFR_RNDN)_exactly_once",
    );
    expect(graph.siAndTerminalAst[14]).toContain(
      "mpfr_get_d(distanceMax,MPFR_RNDU)_exactly_once",
    );
    const destinations = graph.destinationAndContextPolicy;
    expect(destinations).toMatchObject({
      proseSymbolsMustExpandToDestinationIdsBeforeExecution: true,
      everyMpfrDestinationWrittenExactlyOnce: true,
      overwriteOfAnyMpfrDestinationAllowed: false,
      endpointAliasingAllowed: false,
      sourceDestinationAliasingAllowed: false,
      onlyInPlaceOperation: null,
      restoreCallerExponentRangeBeforeReceiptFinalization: true,
      receiptIncludesSuccessfulContextRestoration: true,
      exclusiveContextLease:
        "one_OS_thread_owns_the_MPFR_exponent_range_and_flags_from_the_initial_clear_before_save_through_receipt_finalization_and_no_untraced_MPFR_operation_may_interleave",
      exponentContextOrder:
        "save_emin_then_emax;set_emin_minus_1000000_then_set_emax_plus_1000000;before_receipt_finalization_set_emax_saved_then_set_emin_saved",
    });
    expect(graph.totalTraceOrder[7]).toBe(
      "08_after_all_bytes_and_observations_exist_clear_MPFR_destinations_then_MPZ_values_in_reverse_creation_order_restore_saved_emax_then_saved_emin_require_success_finalize_the_receipt_then_release_the_exclusive_MPFR_context",
    );
    expect(destinations.destinationLifecycle).toEqual({
      construction:
        "mpfr_init2(freshDestination,256)_immediately_before_that_destination_one_arithmetic_write_and_before_no_earlier_operation",
      initializationIsRecordedAsContextOperation: true,
      destruction:
        "after_all_output_words_and_primitive_observations_exist_mpfr_clear_every_destination_in_strict_reverse_init2_order",
      mpzLifecycle:
        "mpz_init_immediately_before_each_mpz_set_str_and_mpz_clear_in_strict_reverse_mpz_init_order_after_all_MPFR_destinations_are_cleared",
      oneMonotoneTraceOrdinalAcrossAllReturnKindsAndLifecycleOperations: true,
    });
    const frozenText = JSON.stringify(graph);
    expect(frozenText).not.toContain("destination,destination");
    expect(frozenText).not.toContain("mpfr_set_ui(cSi,");
    expect(frozenText).not.toContain("mpfr_set_ui(uExact,");
    expect(graph.forbiddenAlternativeGraphs).toEqual(
      expect.arrayContaining([
        "axisNumerator_over_8_divided_by_sqrt_q_over_64",
        "set_ui_q_then_div_ui_64_then_sqrt_instead_of_set_ui_q_then_sqrt_then_div_ui_8",
        "reuse_a_destination_or_endpoint_handle",
        "overwrite_a_destination_to_canonicalize_zero",
        "reuse_one_axis_destination_for_x_y_or_z",
        "visit_all_64_samples_inside_each_radius_group",
        "accept_an_unreduced_even_nonzero_dyadic_mantissa_or_a_nonunique_zero",
        "reassociate_or_balance_any_three_or_more_term_sum",
      ]),
    );
    expect(
      contract.intervalAndSerializationProgram.binary64BoundaryExceptions,
    ).toHaveLength(2);
  });

  it("fails closed on the missing normalization DAG overlay and run instances", () => {
    expect(
      contract.derivationAuthorityBoundary.normalizationDependencyOverlay,
    ).toEqual({
      baseDagMutatedByThisArtifact: false,
      approvalPresent: false,
      successorApprovalRequired: true,
      requiredEdges: [
        {
          from: "normalization",
          to: "metric_demand_tensor",
          relation: "normalization_to_physical_metric_demand_scale",
        },
        {
          from: "normalization",
          to: "metric_demand_absolute_error_bound",
          relation: "normalization_uncertainty_to_metric_error_bytes",
        },
        {
          from: "normalization",
          to: "metric_demand_error_bound_derivation_witness",
          relation: "normalization_uncertainty_to_metric_error_enclosure",
        },
      ],
      reason:
        "the_frozen_base_DAG_covers_geometry_chart_and_sampling_but_not_the_SI_scale_and_G_uncertainty_consumed_by_this_physical_J_per_m3_output",
    });
    expect(contract.blockers).toContain(
      "metric_demand_normalization_dependency_overlay_not_approved",
    );
    expect(contract.derivationAuthorityBoundary).toMatchObject({
      centralBytes: null,
      errorBytes: null,
      derivationReceipt: null,
      primaryIntervalReplayReceipt: null,
      independentIntervalReplayReceipt: null,
      exactByteAgreementReceipt: null,
    });
    expect(
      Object.values(contract.authorityLocks).every((value) => !value),
    ).toBe(true);
  });

  it("accepts only the exact in-module object as authoritative", () => {
    expect(isNhm2SphericalBosonStarV2MetricDemandProgramV1(contract)).toBe(
      true,
    );
    expect(
      nhm2SphericalBosonStarV2MetricDemandProgramViolations(contract),
    ).toEqual([]);
    expect(
      nhm2SphericalBosonStarV2MetricDemandProgramViolations(
        NHM2_SPHERICAL_BOSON_STAR_V2_METRIC_DEMAND_PROGRAM_CANONICAL_JSON,
      ),
    ).toEqual(["metric_demand_program_external_copy_not_authoritative"]);
    expect(
      nhm2SphericalBosonStarV2MetricDemandProgramViolations(
        JSON.stringify({ ...contract, maturity: "forged" }),
      ),
    ).not.toEqual([]);
  });

  it("rejects hostile live graphs before traversing them", () => {
    let traps = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1;
          throw new Error("must not execute");
        },
        ownKeys() {
          traps += 1;
          throw new Error("must not execute");
        },
      },
    );
    expect(
      nhm2SphericalBosonStarV2MetricDemandProgramViolations(hostile),
    ).toEqual(["metric_demand_program_wire_required"]);
    expect(traps).toBe(0);
    expect(
      nhm2SphericalBosonStarV2MetricDemandProgramViolations(
        " ".repeat(131_073),
      ),
    ).toEqual(["metric_demand_program_wire_code_unit_limit"]);
    expect(
      nhm2SphericalBosonStarV2MetricDemandProgramViolations('{"x":1 }'),
    ).toEqual(["metric_demand_program_wire_not_canonical"]);
  });

  it("enforces every hostile wire resource bound before authority checks", () => {
    const violations = nhm2SphericalBosonStarV2MetricDemandProgramViolations;
    expect(
      violations(JSON.stringify(String.fromCharCode(0x20ac).repeat(100_000))),
    ).toEqual(["metric_demand_program_wire_byte_limit"]);
    expect(violations("[".repeat(25) + "null" + "]".repeat(25))[0]).toMatch(
      /^wire_depth_limit:/,
    );
    expect(
      violations(
        JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 256 }, (_, index) => [
              `k${index}`,
              Array(32).fill(null),
            ]),
          ),
        ),
      )[0],
    ).toMatch(/^wire_node_limit:/);
    expect(violations(JSON.stringify(Array(1_025).fill(null)))[0]).toMatch(
      /^wire_array_limit:/,
    );
    expect(
      violations(
        JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 257 }, (_, index) => [`k${index}`, null]),
          ),
        ),
      )[0],
    ).toMatch(/^wire_object_limit:/);
    expect(violations(JSON.stringify("a".repeat(32_769)))[0]).toMatch(
      /^wire_string_limit:/,
    );
    expect(violations("-0")).toEqual(["wire_number_invalid:/"]);
    expect(violations("1e999")).toEqual(["wire_number_invalid:/"]);
  });

  it("deep-freezes the policy and preserves all claim locks", () => {
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.sampleBoundary.projectionBySample)).toBe(
      true,
    );
    expect(Object.isFrozen(contract.authorityLocks)).toBe(true);
    expect(() =>
      Reflect.set(contract.authorityLocks, "physicalViability", true),
    ).not.toThrow();
    expect(contract.authorityLocks.physicalViability).toBe(false);
    expect(contract.authorityLocks.propulsion).toBe(false);
    expect(contract.authorityLocks.transport).toBe(false);
  });
});
