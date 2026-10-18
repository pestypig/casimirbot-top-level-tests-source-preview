import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const RAW_PATH = resolve(
  REPO_ROOT,
  "configs/research/fixtures/nhm2-spherical-gl256-mpfr256.v1.jsonl",
);
const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "configs/research/nhm2-spherical-gl256-mpfr256-manifest.v1.json",
);
const SCRIPT_PATH = resolve(
  REPO_ROOT,
  "scripts/research/build-verify-nhm2-spherical-gl256-mpfr256.py",
);
const TEST_PATH = resolve(
  REPO_ROOT,
  "tests/nhm2-spherical-gl256-mpfr256-fixture.spec.ts",
);

const RECORD_SCHEMA = "nhm2_spherical_gl256_mpfr256_record/v1";
const MANIFEST_SCHEMA = "nhm2_spherical_gl256_mpfr256_manifest/v1";
const ORDER = 256;
const INTERVAL_PRECISION_BITS = 1536;
const ROOT_REFINEMENT_MAX_ITERATIONS = 12;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type EncodedDyadic = {
  exponent2: number;
  sign: -1 | 1;
  significandHex: string;
};

type FixtureRecord = {
  index: number;
  node: EncodedDyadic;
  schema: string;
  weight: EncodedDyadic;
};

type Dyadic = Readonly<{ n: bigint; e: number }>;
type Interval = Readonly<{ lo: Dyadic; hi: Dyadic }>;

function sha256(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}

function canonicalJson(value: Json): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`noncanonical_json_number:${String(value)}`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(",")}}`;
}

function exactKeys(value: object, expected: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expected].sort());
}

function bitLength(value: bigint): number {
  const magnitude = value < 0n ? -value : value;
  return magnitude === 0n ? 0 : magnitude.toString(2).length;
}

function normalize(value: Dyadic): Dyadic {
  if (value.n === 0n) {
    return { n: 0n, e: 0 };
  }
  let numerator = value.n;
  let exponent = value.e;
  while ((numerator & 1n) === 0n) {
    numerator >>= 1n;
    exponent += 1;
  }
  return { n: numerator, e: exponent };
}

function compare(left: Dyadic, right: Dyadic): -1 | 0 | 1 {
  const exponent = Math.min(left.e, right.e);
  const leftInteger = left.n << BigInt(left.e - exponent);
  const rightInteger = right.n << BigInt(right.e - exponent);
  return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
}

function exactAdd(left: Dyadic, right: Dyadic): Dyadic {
  const exponent = Math.min(left.e, right.e);
  return normalize({
    n:
      (left.n << BigInt(left.e - exponent)) +
      (right.n << BigInt(right.e - exponent)),
    e: exponent,
  });
}

function exactNegate(value: Dyadic): Dyadic {
  return { n: -value.n, e: value.e };
}

function exactSubtract(left: Dyadic, right: Dyadic): Dyadic {
  return exactAdd(left, exactNegate(right));
}

function exactMultiply(left: Dyadic, right: Dyadic): Dyadic {
  return normalize({ n: left.n * right.n, e: left.e + right.e });
}

function floorDivideByPowerOfTwo(value: bigint, shift: number): bigint {
  if (shift === 0) return value;
  const denominator = 1n << BigInt(shift);
  if (value >= 0n) return value >> BigInt(shift);
  return -((-value + denominator - 1n) >> BigInt(shift));
}

function ceilDivideByPowerOfTwo(value: bigint, shift: number): bigint {
  if (shift === 0) return value;
  const denominator = 1n << BigInt(shift);
  if (value >= 0n) {
    return (value + denominator - 1n) >> BigInt(shift);
  }
  return -(-value >> BigInt(shift));
}

function roundOutward(value: Dyadic, direction: "down" | "up"): Dyadic {
  const excessBits = bitLength(value.n) - INTERVAL_PRECISION_BITS;
  if (excessBits <= 0) return normalize(value);
  const rounded =
    direction === "down"
      ? floorDivideByPowerOfTwo(value.n, excessBits)
      : ceilDivideByPowerOfTwo(value.n, excessBits);
  return normalize({ n: rounded, e: value.e + excessBits });
}

function floorRational(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("positive_denominator_required");
  if (numerator >= 0n) return numerator / denominator;
  return -((-numerator + denominator - 1n) / denominator);
}

function ceilRational(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("positive_denominator_required");
  if (numerator >= 0n) return (numerator + denominator - 1n) / denominator;
  return -(-numerator / denominator);
}

function divideDirected(
  left: Dyadic,
  right: Dyadic,
  direction: "down" | "up",
): Dyadic {
  if (right.n === 0n) throw new Error("division_by_zero");
  let numerator = left.n;
  let denominator = right.n;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0n) return { n: 0n, e: 0 };
  const exponent = left.e - right.e;
  const magnitudeDifference = bitLength(numerator) - bitLength(denominator);
  const outputExponent =
    exponent + magnitudeDifference - (INTERVAL_PRECISION_BITS - 1);
  const scaleShift = exponent - outputExponent;
  let scaledNumerator = numerator;
  let scaledDenominator = denominator;
  if (scaleShift >= 0) {
    scaledNumerator <<= BigInt(scaleShift);
  } else {
    scaledDenominator <<= BigInt(-scaleShift);
  }
  const quotient =
    direction === "down"
      ? floorRational(scaledNumerator, scaledDenominator)
      : ceilRational(scaledNumerator, scaledDenominator);
  return roundOutward({ n: quotient, e: outputExponent }, direction);
}

function interval(lo: Dyadic, hi: Dyadic): Interval {
  if (compare(lo, hi) > 0) throw new Error("inverted_interval");
  return { lo, hi };
}

function point(value: Dyadic): Interval {
  return interval(value, value);
}

function integer(value: number): Interval {
  if (!Number.isSafeInteger(value)) throw new Error("safe_integer_required");
  return point({ n: BigInt(value), e: 0 });
}

function add(left: Interval, right: Interval): Interval {
  return interval(
    roundOutward(exactAdd(left.lo, right.lo), "down"),
    roundOutward(exactAdd(left.hi, right.hi), "up"),
  );
}

function negate(value: Interval): Interval {
  return interval(exactNegate(value.hi), exactNegate(value.lo));
}

function subtract(left: Interval, right: Interval): Interval {
  return add(left, negate(right));
}

function multiply(left: Interval, right: Interval): Interval {
  const candidates = [
    exactMultiply(left.lo, right.lo),
    exactMultiply(left.lo, right.hi),
    exactMultiply(left.hi, right.lo),
    exactMultiply(left.hi, right.hi),
  ];
  let minimum = candidates[0]!;
  let maximum = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (compare(candidate, minimum) < 0) minimum = candidate;
    if (compare(candidate, maximum) > 0) maximum = candidate;
  }
  return interval(roundOutward(minimum, "down"), roundOutward(maximum, "up"));
}

function divide(left: Interval, right: Interval): Interval {
  if (compare(right.lo, { n: 0n, e: 0 }) <= 0) {
    throw new Error("strictly_positive_divisor_interval_required");
  }
  const lowerCandidates = [
    divideDirected(left.lo, right.lo, "down"),
    divideDirected(left.lo, right.hi, "down"),
    divideDirected(left.hi, right.lo, "down"),
    divideDirected(left.hi, right.hi, "down"),
  ];
  const upperCandidates = [
    divideDirected(left.lo, right.lo, "up"),
    divideDirected(left.lo, right.hi, "up"),
    divideDirected(left.hi, right.lo, "up"),
    divideDirected(left.hi, right.hi, "up"),
  ];
  let minimum = lowerCandidates[0]!;
  let maximum = upperCandidates[0]!;
  for (const candidate of lowerCandidates.slice(1)) {
    if (compare(candidate, minimum) < 0) minimum = candidate;
  }
  for (const candidate of upperCandidates.slice(1)) {
    if (compare(candidate, maximum) > 0) maximum = candidate;
  }
  return interval(minimum, maximum);
}

function square(value: Interval): Interval {
  const zero: Dyadic = { n: 0n, e: 0 };
  if (compare(value.lo, zero) >= 0) {
    return interval(
      roundOutward(exactMultiply(value.lo, value.lo), "down"),
      roundOutward(exactMultiply(value.hi, value.hi), "up"),
    );
  }
  if (compare(value.hi, zero) <= 0) {
    return interval(
      roundOutward(exactMultiply(value.hi, value.hi), "down"),
      roundOutward(exactMultiply(value.lo, value.lo), "up"),
    );
  }
  const leftSquare = exactMultiply(value.lo, value.lo);
  const rightSquare = exactMultiply(value.hi, value.hi);
  const maximum =
    compare(leftSquare, rightSquare) >= 0 ? leftSquare : rightSquare;
  return interval(zero, roundOutward(maximum, "up"));
}

function containsZero(value: Interval): boolean {
  const zero: Dyadic = { n: 0n, e: 0 };
  return compare(value.lo, zero) <= 0 && compare(value.hi, zero) >= 0;
}

function isSubset(inner: Interval, outer: Interval): boolean {
  return compare(outer.lo, inner.lo) <= 0 && compare(inner.hi, outer.hi) <= 0;
}

function hull(left: Interval, right: Interval): Interval {
  return interval(
    compare(left.lo, right.lo) <= 0 ? left.lo : right.lo,
    compare(left.hi, right.hi) >= 0 ? left.hi : right.hi,
  );
}

function compareDyadicToRational(
  dyadic: Dyadic,
  numerator: bigint,
  denominator: bigint,
): -1 | 0 | 1 {
  if (denominator <= 0n)
    throw new Error("positive_rational_denominator_required");
  let left: bigint;
  let right: bigint;
  if (dyadic.e >= 0) {
    left = (dyadic.n << BigInt(dyadic.e)) * denominator;
    right = numerator;
  } else {
    left = dyadic.n * denominator;
    right = numerator << BigInt(-dyadic.e);
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function containsRational(
  value: Interval,
  numerator: bigint,
  denominator: bigint,
): boolean {
  return (
    compareDyadicToRational(value.lo, numerator, denominator) <= 0 &&
    compareDyadicToRational(value.hi, numerator, denominator) >= 0
  );
}

function equalsRational(
  value: Dyadic,
  numerator: bigint,
  denominator: bigint,
): boolean {
  return compareDyadicToRational(value, numerator, denominator) === 0;
}

function decode(encoded: EncodedDyadic): Dyadic {
  exactKeys(encoded, ["exponent2", "sign", "significandHex"]);
  expect(encoded.sign === -1 || encoded.sign === 1).toBe(true);
  expect(Number.isSafeInteger(encoded.exponent2)).toBe(true);
  expect(encoded.significandHex).toMatch(/^[89a-f][0-9a-f]{63}$/);
  const magnitude = BigInt(`0x${encoded.significandHex}`);
  expect(bitLength(magnitude)).toBe(256);
  return { n: BigInt(encoded.sign) * magnitude, e: encoded.exponent2 };
}

function decodeCell(encoded: EncodedDyadic): Interval {
  const center = decode(encoded);
  const halfUlp: Dyadic = { n: 1n, e: encoded.exponent2 - 1 };
  return interval(exactSubtract(center, halfUlp), exactAdd(center, halfUlp));
}

function expand(value: Interval, radius: Dyadic): Interval {
  if (radius.n < 0n) throw new Error("nonnegative_radius_required");
  return interval(
    roundOutward(exactSubtract(value.lo, radius), "down"),
    roundOutward(exactAdd(value.hi, radius), "up"),
  );
}

function midpoint(value: Interval): Dyadic {
  const sum = exactAdd(value.lo, value.hi);
  return normalize({ n: sum.n, e: sum.e - 1 });
}

function radiusFromMidpoint(value: Interval, center: Dyadic): Dyadic {
  const left = exactSubtract(center, value.lo);
  const right = exactSubtract(value.hi, center);
  if (left.n < 0n || right.n < 0n) throw new Error("midpoint_outside_interval");
  return compare(left, right) >= 0 ? left : right;
}

function intersect(left: Interval, right: Interval): Interval | null {
  const lo = compare(left.lo, right.lo) >= 0 ? left.lo : right.lo;
  const hi = compare(left.hi, right.hi) <= 0 ? left.hi : right.hi;
  return compare(lo, hi) <= 0 ? interval(lo, hi) : null;
}

function divideByNonzero(left: Interval, right: Interval): Interval {
  const zero: Dyadic = { n: 0n, e: 0 };
  if (compare(right.lo, zero) > 0) return divide(left, right);
  if (compare(right.hi, zero) < 0) return divide(negate(left), negate(right));
  throw new Error("nonzero_divisor_interval_required");
}

function legendreValueAndDerivativeAtPoint(
  order: number,
  xMidpoint: Dyadic,
): [Interval, Interval] {
  const x = point(xMidpoint);
  let pNm2 = integer(1);
  let dNm2 = integer(0);
  if (order === 1) return [x, integer(1)];
  let pNm1 = x;
  let dNm1 = integer(1);
  for (let degree = 2; degree <= order; degree += 1) {
    const first = multiply(integer(2 * degree - 1), multiply(x, pNm1));
    const second = multiply(integer(degree - 1), pNm2);
    const pN = divide(subtract(first, second), integer(degree));
    const derivativeFirst = multiply(
      integer(2 * degree - 1),
      add(pNm1, multiply(x, dNm1)),
    );
    const derivativeSecond = multiply(integer(degree - 1), dNm2);
    const dN = divide(
      subtract(derivativeFirst, derivativeSecond),
      integer(degree),
    );
    pNm2 = pNm1;
    pNm1 = pN;
    dNm2 = dNm1;
    dNm1 = dN;
  }
  return [pNm1, dNm1];
}

function legendreDerivativeCell(
  rootCell: Interval,
  secondDerivativeBound: number,
): { center: Dyadic; derivative: Interval; value: Interval } {
  const center = midpoint(rootCell);
  const [value, derivativeAtCenter] = legendreValueAndDerivativeAtPoint(
    ORDER,
    center,
  );
  const radius = radiusFromMidpoint(rootCell, center);
  const derivativeRadius = exactMultiply(
    { n: BigInt(secondDerivativeBound), e: 0 },
    radius,
  );
  return {
    center,
    derivative: expand(derivativeAtCenter, derivativeRadius),
    value,
  };
}

function weightFormulaCell(
  rootCell: Interval,
  derivativeCell: Interval,
): Interval {
  const oneMinusXSquared = subtract(integer(1), square(rootCell));
  if (compare(oneMinusXSquared.lo, { n: 0n, e: 0 }) <= 0) {
    throw new Error("positive_one_minus_root_squared_required");
  }
  const denominator = multiply(oneMinusXSquared, square(derivativeCell));
  if (compare(denominator.lo, { n: 0n, e: 0 }) <= 0) {
    throw new Error("positive_weight_denominator_required");
  }
  return divide(integer(2), denominator);
}

function refineRootUntilWeightContained(
  initialRootCell: Interval,
  serializedWeightCell: Interval,
  secondDerivativeBound: number,
): {
  derivativeCell: Interval;
  iterations: number;
  rootCell: Interval;
  weightCell: Interval;
} {
  let rootCell = initialRootCell;
  for (
    let iteration = 0;
    iteration <= ROOT_REFINEMENT_MAX_ITERATIONS;
    iteration += 1
  ) {
    const observation = legendreDerivativeCell(rootCell, secondDerivativeBound);
    if (containsZero(observation.derivative)) {
      throw new Error(`root_refinement_derivative_contains_zero:${iteration}`);
    }
    const formulaWeight = weightFormulaCell(rootCell, observation.derivative);
    if (isSubset(formulaWeight, serializedWeightCell)) {
      return {
        derivativeCell: observation.derivative,
        iterations: iteration,
        rootCell,
        weightCell: formulaWeight,
      };
    }
    if (iteration === ROOT_REFINEMENT_MAX_ITERATIONS) break;
    // Interval Newton: for the already proved unique root r in X,
    // r = m - P_n(m)/P_n'(xi), with xi in X.  The derivative cell encloses
    // every P_n'(xi), so intersecting X with this image preserves r.
    const correction = divideByNonzero(
      observation.value,
      observation.derivative,
    );
    const newtonImage = subtract(point(observation.center), correction);
    const contracted = intersect(rootCell, newtonImage);
    if (contracted === null) {
      throw new Error(`root_refinement_empty_intersection:${iteration}`);
    }
    if (
      compare(contracted.lo, rootCell.lo) === 0 &&
      compare(contracted.hi, rootCell.hi) === 0
    ) {
      throw new Error(`root_refinement_no_contraction:${iteration}`);
    }
    rootCell = contracted;
  }
  throw new Error("root_refinement_weight_containment_unresolved");
}

const rawFixture = readFileSync(RAW_PATH);
const rawManifest = readFileSync(MANIFEST_PATH);
const manifest = JSON.parse(rawManifest.toString("ascii")) as Record<
  string,
  any
>;
const lines = rawFixture.toString("ascii").split("\n");
if (lines.at(-1) === "") lines.pop();
const records = lines.map((line) => JSON.parse(line) as FixtureRecord);

describe("candidate-independent spherical GL256 MPFR-256 fixture", () => {
  it("binds canonical manifest, generator, independent verifier, and exact raw bytes", () => {
    expect(rawManifest.toString("ascii")).toBe(
      `${canonicalJson(manifest as Json)}\n`,
    );
    expect(manifest.schema).toBe(MANIFEST_SCHEMA);
    expect(manifest.scope).toEqual({
      candidateData: false,
      candidateIndependent: true,
      diagnosticOnly: true,
      seedSolveExecuted: false,
    });
    expect(Object.values(manifest.authorityLocks)).toEqual(
      expect.arrayContaining([false]),
    );
    expect(
      Object.values(manifest.authorityLocks).every((value) => value === false),
    ).toBe(true);

    expect(manifest.fixture.path).toBe(
      "configs/research/fixtures/nhm2-spherical-gl256-mpfr256.v1.jsonl",
    );
    expect(manifest.fixture.recordCount).toBe(ORDER);
    expect(manifest.fixture.nodeCount).toBe(ORDER);
    expect(manifest.fixture.recordSchema).toBe(RECORD_SCHEMA);
    expect(manifest.fixture.sha256).toBe(sha256(rawFixture));
    expect(manifest.fixture.sizeBytes).toBe(rawFixture.byteLength);

    const script = readFileSync(SCRIPT_PATH);
    expect(manifest.generation.script.path).toBe(
      "scripts/research/build-verify-nhm2-spherical-gl256-mpfr256.py",
    );
    expect(manifest.generation.script.sha256).toBe(sha256(script));
    expect(manifest.generation.script.sizeBytes).toBe(script.byteLength);
    expect(manifest.generation.serializationPrecisionBits).toBe(256);
    expect(manifest.generation.workPrecisionsBits).toEqual([1024, 1536]);
    expect(manifest.generation.rounding).toBe("MPFR_RNDN_nearest_ties_to_even");
    expect(manifest.generation.runtime).toMatchObject({
      gmpVersion: "GMP 6.3.0",
      gmpy2Version: "2.3.1",
      mpcVersion: "MPC 1.4.0",
      mpfrVersion: "MPFR 4.2.2",
      pythonImplementation: "CPython",
      pythonVersion: "3.13.7",
    });
    expect(manifest.generation.runtime.gmpy2NativeExtension).toMatchObject({
      basename: expect.stringMatching(/^gmpy2\..+\.pyd$/),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      sizeBytes: expect.any(Number),
    });
    expect(manifest.generation.runtime.gmpy2NativeRuntimeClosure).toEqual(
      [
        "libgcc_s_seh-1.dll",
        "libgmp-10.dll",
        "libmpc-3.dll",
        "libmpfr-6.dll",
        "libwinpthread-1.dll",
      ].map((basename) => ({
        basename,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        sizeBytes: expect.any(Number),
      })),
    );
    expect(manifest.generation.runtime.gmpy2NativeRuntimeInventory).toEqual({
      coverage:
        "all_case_insensitive_.dll_entries_in_resolved_gmpy2_package_parent_parent/gmpy2.libs",
      expectedBasenames: [
        "libgcc_s_seh-1.dll",
        "libgmp-10.dll",
        "libmpc-3.dll",
        "libmpfr-6.dll",
        "libwinpthread-1.dll",
      ],
      filePolicy: "regular_nonsymlink_files_only",
      missingExtraOrReorderedPolicy: "fail_closed",
      ordering: "ascending_case_sensitive_basename",
      scope:
        "complete_wheel_bundled_GMP_MPFR_MPC_native_closure_including_bundled_runtime_dependencies",
    });
    expect(manifest.generation.runtime.gmpy2PackageInit).toMatchObject({
      basename: "__init__.py",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      sizeBytes: expect.any(Number),
    });
    expect(manifest.generation.runtime.pythonExecutable).toMatchObject({
      basename: "python.exe",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      sizeBytes: expect.any(Number),
    });

    const independentTest = readFileSync(TEST_PATH);
    expect(manifest.independentVerifier.test.path).toBe(
      "tests/nhm2-spherical-gl256-mpfr256-fixture.spec.ts",
    );
    expect(manifest.independentVerifier.test.sha256).toBe(
      sha256(independentTest),
    );
    expect(manifest.independentVerifier.test.sizeBytes).toBe(
      independentTest.byteLength,
    );
    expect(manifest.independentVerifier.candidateDataImported).toBe(false);
    expect(manifest.independentVerifier.checks).toEqual([
      "raw_sha256_and_size",
      "canonical_records_and_exact_count",
      "strict_order_symmetry_positive_weights",
      "sum_two_half_ulp_enclosure",
      "P256_root_residual_half_ulp_enclosure",
      "P256_unique_root_bracket_half_ulp_cell",
      "interval_newton_root_refinement",
      "true_weight_formula_interval_subset_of_serialized_half_ulp_cell",
      "serialized_dyadic_centers_explicitly_not_exact",
      "underlying_exact_GL_rule_true_moment_enclosures_degrees_0_through_511",
    ]);
    expect(manifest.independentVerifier.enclosureSemantics).toEqual({
      momentClaim:
        "outward_intervals_from_proved_true_root_and_weight_enclosures_contain_each_exact_GL_moment_target_for_degrees_0_through_511",
      rootClaim:
        "each_serialized_node_half_ulp_cell_contains_exactly_one_true_P256_root",
      serializedCenterClaim:
        "rounded_dyadic_centers_are_not_asserted_to_be_exact_algebraic_nodes_weights_or_moments",
      weightClaim:
        "the_true_GL_weight_formula_interval_at_each_proved_root_is_contained_in_its_serialized_weight_half_ulp_cell",
    });
    expect(manifest.independentVerifier.rootRefinement).toEqual({
      arithmeticPrecisionBits: INTERVAL_PRECISION_BITS,
      maximumIterations: ROOT_REFINEMENT_MAX_ITERATIONS,
      method:
        "exact_dyadic_interval_newton_with_global_P256_second_derivative_bound",
      observedFrozenFixtureIterations: {
        histogram: { "1": 256 },
        maximum: 1,
      },
      requiredStopCondition:
        "directed_true_weight_interval_subset_of_serialized_weight_half_ulp_cell",
      unresolvedAsFail: true,
    });
    expect(manifest.quadrature.underlyingExactAlgebraicRule).toEqual({
      degreeExactness: 511,
      momentIdentity: "sum_i(w_i*x_i^k)=integral_-1^1(x^k dx),0<=k<=511",
      theorem: "Gauss-Legendre_exactness",
    });
    expect(manifest.quadrature.serializedDyadicCenters).toEqual({
      algebraicExactness: false,
      degreeExactness: false,
      momentsExact: false,
      nodeCentersEqualAlgebraicRoots: false,
      rootResidualsExactlyZero: false,
      weightCentersEqualAlgebraicWeights: false,
      weightSumExactlyTwo: false,
    });
  });

  it("has 256 canonical, strictly ordered, exactly symmetric records", () => {
    expect(rawFixture.includes(Buffer.from("\r"))).toBe(false);
    expect(rawFixture.at(-1)).toBe(0x0a);
    expect(records).toHaveLength(ORDER);
    const nodes: Dyadic[] = [];
    const weights: Dyadic[] = [];
    for (const [index, record] of records.entries()) {
      const canonicalLine = `${canonicalJson(record as unknown as Json)}\n`;
      expect(`${lines[index]}\n`).toBe(canonicalLine);
      exactKeys(record, ["index", "node", "schema", "weight"]);
      expect(record.index).toBe(index);
      expect(record.schema).toBe(RECORD_SCHEMA);
      const node = decode(record.node);
      const weight = decode(record.weight);
      expect(compare(weight, { n: 0n, e: 0 })).toBe(1);
      nodes.push(node);
      weights.push(weight);
      if (index > 0) {
        expect(compare(nodes[index - 1]!, node)).toBe(-1);
        const previousCell = decodeCell(records[index - 1]!.node);
        const currentCell = decodeCell(record.node);
        expect(compare(previousCell.hi, currentCell.lo)).toBe(-1);
      }
    }
    for (let index = 0; index < ORDER / 2; index += 1) {
      const mirror = ORDER - 1 - index;
      expect(compare(nodes[index]!, exactNegate(nodes[mirror]!))).toBe(0);
      expect(compare(weights[index]!, weights[mirror]!)).toBe(0);
      expect(records[index]!.weight).toEqual(records[mirror]!.weight);
      expect(records[index]!.node.sign).toBe(-1);
      expect(records[mirror]!.node.sign).toBe(1);
      expect(records[index]!.node.exponent2).toBe(
        records[mirror]!.node.exponent2,
      );
      expect(records[index]!.node.significandHex).toBe(
        records[mirror]!.node.significandHex,
      );
    }
  });

  it("independently encloses sum, P256 roots, weight formula, and every degree 0..511 moment", () => {
    const nodeCells = records.map((record) => decodeCell(record.node));
    const weightCells = records.map((record) => decodeCell(record.weight));
    const refinedNodeCells: Interval[] = [];
    const trueWeightCells: Interval[] = [];
    const refinementIterations: number[] = [];

    let weightSum = integer(0);
    for (const weight of weightCells) weightSum = add(weightSum, weight);
    expect(containsRational(weightSum, 2n, 1n)).toBe(true);
    const exactCenterWeightSum = records.reduce(
      (sum, record) => exactAdd(sum, decode(record.weight)),
      { n: 0n, e: 0 } satisfies Dyadic,
    );
    expect(equalsRational(exactCenterWeightSum, 2n, 1n)).toBe(false);

    const centerDegreeTwoMoment = records.reduce(
      (sum, record) => {
        const node = decode(record.node);
        return exactAdd(
          sum,
          exactMultiply(decode(record.weight), exactMultiply(node, node)),
        );
      },
      { n: 0n, e: 0 } satisfies Dyadic,
    );
    expect(equalsRational(centerDegreeTwoMoment, 2n, 3n)).toBe(false);

    for (let index = 0; index < ORDER; index += 1) {
      const x = nodeCells[index]!;
      const xMidpoint = decode(records[index]!.node);
      const xHalfUlp: Dyadic = {
        n: 1n,
        e: records[index]!.node.exponent2 - 1,
      };
      const [pNMidpoint, derivativeMidpoint] =
        legendreValueAndDerivativeAtPoint(ORDER, xMidpoint);
      // On [-1,1], max |P_n'| = P_n'(1) = n(n+1)/2.  The
      // mean-value theorem therefore expands the independently evaluated
      // midpoint value over the complete serialized node half-ulp cell.
      const firstDerivativeBound = (ORDER * (ORDER + 1)) / 2;
      const residualRadius = exactMultiply(
        { n: BigInt(firstDerivativeBound), e: 0 },
        xHalfUlp,
      );
      const pNCell = expand(pNMidpoint, residualRadius);
      expect(containsZero(pNCell), `P256 residual at record ${index}`).toBe(
        true,
      );

      const oneMinusXSquared = subtract(integer(1), square(x));
      expect(compare(oneMinusXSquared.lo, { n: 0n, e: 0 })).toBe(1);
      // Likewise max |P_n''| = P_n''(1) =
      // n(n-1)(n+1)(n+2)/8.  This produces a rigorous derivative cell
      // without the dependency blow-up of an interval three-term
      // recurrence near the endpoint roots.
      const secondDerivativeBound =
        (ORDER * (ORDER - 1) * (ORDER + 1) * (ORDER + 2)) / 8;
      const derivativeRadius = exactMultiply(
        { n: BigInt(secondDerivativeBound), e: 0 },
        xHalfUlp,
      );
      const derivative = expand(derivativeMidpoint, derivativeRadius);
      expect(
        containsZero(derivative),
        `P256 derivative at record ${index}`,
      ).toBe(false);
      // Taylor's theorem with the same global P_n'' bound places the two
      // half-ulp-cell endpoints on opposite sides of zero.  Combined with
      // the nonzero derivative cell, this proves one and only one P256 root
      // lies in each serialized cell.
      const firstOrderDisplacement = multiply(
        point(xHalfUlp),
        derivativeMidpoint,
      );
      const remainderRadius = exactMultiply(
        { n: BigInt(secondDerivativeBound / 2), e: 0 },
        exactMultiply(xHalfUlp, xHalfUlp),
      );
      const leftEndpointValue = expand(
        subtract(pNMidpoint, firstOrderDisplacement),
        remainderRadius,
      );
      const rightEndpointValue = expand(
        add(pNMidpoint, firstOrderDisplacement),
        remainderRadius,
      );
      const zero: Dyadic = { n: 0n, e: 0 };
      const bracketsUniqueRoot =
        (compare(leftEndpointValue.hi, zero) < 0 &&
          compare(rightEndpointValue.lo, zero) > 0) ||
        (compare(leftEndpointValue.lo, zero) > 0 &&
          compare(rightEndpointValue.hi, zero) < 0);
      expect(bracketsUniqueRoot, `P256 root bracket at record ${index}`).toBe(
        true,
      );
      const refined = refineRootUntilWeightContained(
        x,
        weightCells[index]!,
        secondDerivativeBound,
      );
      expect(refined.iterations).toBeLessThanOrEqual(
        ROOT_REFINEMENT_MAX_ITERATIONS,
      );
      expect(
        isSubset(refined.rootCell, x),
        `root subset at record ${index}`,
      ).toBe(true);
      expect(
        isSubset(refined.weightCell, weightCells[index]!),
        `true GL weight subset at record ${index}`,
      ).toBe(true);
      refinedNodeCells.push(refined.rootCell);
      trueWeightCells.push(refined.weightCell);
      refinementIterations.push(refined.iterations);
    }

    expect(refinementIterations).toEqual(Array(ORDER).fill(1));
    expect(refinedNodeCells).toHaveLength(ORDER);
    expect(trueWeightCells).toHaveLength(ORDER);
    // The algebraic rule is exactly reflection-symmetric.  Numerical
    // refinement is performed record-by-record, so explicitly take the
    // mirrored hull and exact sign reflection before moment propagation.
    // This preserves both independently proved root/weight enclosures while
    // preventing artificial odd-moment drift from asymmetric interval
    // contraction.
    for (let index = 0; index < ORDER / 2; index += 1) {
      const mirror = ORDER - 1 - index;
      const positiveRoot = hull(
        refinedNodeCells[mirror]!,
        negate(refinedNodeCells[index]!),
      );
      const reflectedWeight = hull(
        trueWeightCells[index]!,
        trueWeightCells[mirror]!,
      );
      expect(
        isSubset(positiveRoot, nodeCells[mirror]!),
        `symmetrized positive root subset at record ${mirror}`,
      ).toBe(true);
      expect(
        isSubset(negate(positiveRoot), nodeCells[index]!),
        `symmetrized negative root subset at record ${index}`,
      ).toBe(true);
      expect(
        isSubset(reflectedWeight, weightCells[index]!),
        `symmetrized weight subset at record ${index}`,
      ).toBe(true);
      expect(
        isSubset(reflectedWeight, weightCells[mirror]!),
        `symmetrized weight subset at record ${mirror}`,
      ).toBe(true);
      refinedNodeCells[mirror] = positiveRoot;
      refinedNodeCells[index] = negate(positiveRoot);
      trueWeightCells[index] = reflectedWeight;
      trueWeightCells[mirror] = reflectedWeight;
    }
    const powers = refinedNodeCells.map(() => integer(1));
    for (let degree = 0; degree <= 2 * ORDER - 1; degree += 1) {
      let moment = integer(0);
      for (let index = 0; index < ORDER; index += 1) {
        moment = add(moment, multiply(trueWeightCells[index]!, powers[index]!));
      }
      const targetNumerator = degree % 2 === 0 ? 2n : 0n;
      const targetDenominator = BigInt(degree + 1);
      expect(
        containsRational(moment, targetNumerator, targetDenominator),
        `monomial degree ${degree}`,
      ).toBe(true);
      if (degree < 2 * ORDER - 1) {
        for (let index = 0; index < ORDER; index += 1) {
          powers[index] = multiply(powers[index]!, refinedNodeCells[index]!);
        }
      }
    }
  }, 120_000);
});
