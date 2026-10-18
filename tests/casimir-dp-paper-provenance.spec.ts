import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCasimirDpStudyTheoryBadgesV1 } from "../shared/theory/casimir-dp-study-theory-badges";
import { buildHelixTheoryBadgeGraphV1 } from "../shared/theory/helix-theory-badge-graph";

const root = process.cwd();
const mainPath = path.resolve(root, "docs/research/casimir-dp-quantum-foam-study.md");
const supplementPath = path.resolve(
  root,
  "docs/research/casimir-dp-quantum-foam-study-reproducibility-supplement.md",
);
const proposalPath = path.resolve(root, "docs/research/casimir-dp-experiment-proposal.md");
const mainSourcePath = path.resolve(
  root,
  "docs/research/casimir-dp-quantum-foam-study.equation-actions.source.json",
);
const mainGeneratedPath = path.resolve(
  root,
  "docs/research/casimir-dp-quantum-foam-study.equation-actions.json",
);
const supplementSourcePath = path.resolve(
  root,
  "docs/research/casimir-dp-quantum-foam-study-reproducibility-supplement.equation-actions.source.json",
);
const supplementGeneratedPath = path.resolve(
  root,
  "docs/research/casimir-dp-quantum-foam-study-reproducibility-supplement.equation-actions.json",
);
const apparatusFigurePath = path.resolve(
  root,
  "docs/research/figures/casimir-dp/apparatus-schematic.svg",
);
const coherenceFigurePath = path.resolve(
  root,
  "docs/research/figures/casimir-dp/coherence-forecast.svg",
);

const main = readFileSync(mainPath, "utf8");
const supplement = readFileSync(supplementPath, "utf8");
const proposal = readFileSync(proposalPath, "utf8");
const apparatusFigure = readFileSync(apparatusFigurePath, "utf8");
const coherenceFigure = readFileSync(coherenceFigurePath, "utf8");

type Sidecar = {
  docPath: string;
  entries: Array<{
    equationId: string;
    actions?: Array<{ preferredBadgeId?: string; badgeIds?: string[] }>;
  }>;
};

const loadSidecar = (pathname: string): Sidecar =>
  JSON.parse(readFileSync(pathname, "utf8")) as Sidecar;

function markerIds(markdown: string): string[] {
  return [
    ...markdown.matchAll(/helix-doc-equation-action\/v1 id=([^\s]+)\s*-->/g),
  ].map((match) => match[1]);
}

describe("Casimir-Diósi article and reproducibility supplement", () => {
  it("keeps the canonical article focused on the exact tested model", () => {
    expect(main).toMatch(
      /^# An Identifiability-First Feasibility Protocol for a Gaussian-Regularized Diósi Collapse Test with a Casimir-Boundary Control/,
    );
    expect(main).toContain("## 2. Exact tested dynamics");
    expect(main).toContain("nondissipative, Gaussian-regularized Diósi");
    expect(main).toContain("single effective particle");
    expect(main).toContain("Penrose's objective-reduction argument motivates");
    expect(main).toMatch(/they\s+are not the same theory object/);
    expect(main).toContain(
      "not a representation-independent test of the broader collapse-model family",
    );
    expect(main).toContain("#### 2.2.2 Stage-0.1 relational-correspondence benchmark");
    expect(main).toContain("PRC_REFERENCE_RECEIPTS_MISSING");
    expect(supplement).toContain(
      "### 2.5 Stage-0 candidate and Stage-0.1 relational-correspondence benchmark",
    );
    expect(supplement).toContain("0/5 same-apparatus reference packets");
  });

  it("leads with one synthetic commissioning design and demotes older geometries", () => {
    expect(main).toContain("## 3. Leading Synthetic Commissioning Design");
    expect(main).toContain("`stage4_2m_candidate_002`");
    expect(main).toContain("diamond-density sphere");
    expect(main).toContain("276.302 nm");
    expect(main).toContain("3.0925053\\times10^{-16}\\ {\\rm kg}");
    expect(main).toContain("250 nm");
    expect(main).toContain("250 ms");
    expect(main).toContain("10 μm");
    expect(main).toContain("1\\times10^{-15}\\ {\\rm Pa}");
    expect(main).toMatch(
      /The complete stage-by-stage\s+crosswalk is preserved in Section 8\.1/,
    );
    expect(supplement).toContain("### 8.1 Runtime-to-artifact contract");
    expect(supplement).toContain(
      "frozen proposal supersedes its symmetric-force candidate",
    );
    expect(supplement).toContain("Stage-4.2M bounded leading-design search");
    expect(main).toMatch(/\\\(1\.0955\\times10\^6\\\) times more massive/);
    expect(main).toContain("State preparation is the first physical go/no-go");
  });

  it("makes the leading named-model and density-floor forecasts impossible to conflate", () => {
    expect(main).toContain("2.90803\\%");
    expect(main).toContain("lowest transported diagnostic forecast");
    expect(main).toContain("not a physical lower bound");
    expect(main).toMatch(/Neither value is a total\s+measured-visibility forecast/);
    expect(main).toContain("1,028 dimensionless paired allocation units");
    expect(main).toContain("power 0.927 at 1,600 units");
  });

  it("keeps the leading design synchronized in the human-facing figures", () => {
    expect(apparatusFigure).toContain("Leading synthetic commissioning design");
    expect(apparatusFigure).toContain("diamond-density sphere");
    expect(apparatusFigure).toContain("250 nm");
    expect(apparatusFigure).toContain("10 μm surface gap");
    expect(apparatusFigure).toContain("3.09251×10⁻¹⁶ kg");
    expect(coherenceFigure).toContain("effective Gaussian: 2.908% at 250 ms");
    expect(coherenceFigure).toContain("lowest diagnostic: 0.435% at 250 ms");
    expect(coherenceFigure).toContain("transported density diagnostic");
    expect(coherenceFigure).not.toContain("reference: 0.598%");
  });

  it("preserves hypothesis and observable separation", () => {
    for (const heading of [
      "### 4.1 Ordinary-physics null, H0",
      "### 4.2 Frozen Diósi hypothesis, HD",
      "### 4.3 Lane C: boundary-conditioned extension, HB",
      "### 4.4 Manifold-response hypothesis",
      "### 4.5 Compton-frequency non-bridge",
      "## 9. Observable-separation gate",
      "## 11. Discussion",
      "## 12. Claim boundaries",
    ]) {
      expect(main).toContain(heading);
    }
    expect(main).toMatch(
      /No Casimir variable enters the registered collapse\s+generator/,
    );
    expect(main).toMatch(
      /A Casimir-correlated residual cannot move from the left branch to\s+the right branch without a registered transfer kernel/,
    );
    expect(main).toMatch(
      /renormalized negative energy density is not automatically negative spacetime\s+curvature/,
    );
  });

  it("separates parent identifiability from the leading selected-candidate forecast", () => {
    expect(main).toContain("0.999977");
    expect(main).toContain("179,104");
    expect(main).toContain("0.717724");
    expect(main).toContain("6.53169");
    expect(main).toContain("0.997858");
    expect(main).toContain("542");
    expect(main).toContain("0.927386");
    expect(main).toContain("1,028");
    expect(main).toMatch(
      /The next empirical computation\s+must report an envelope rather than a single number/,
    );
    for (const requiredStress of [
      "finite-pilot covariance",
      "shrinkage/regularization",
      "drift and non-Gaussian tails",
      "response amplitude/phase error",
      "missing nuisance",
      "branch and hold-time jitter",
      "leave-one-control-out",
      "selection optimism",
    ]) {
      expect(main).toContain(requiredStress);
    }
  });

  it("exposes the Stage-4.2I four-cell interaction without promoting it to collapse", () => {
    expect(main).toContain("### 5.1 Boundary--branch interaction diagnostic");
    expect(main).toContain("cdp-stage4-2i-complex-cross-ratio");
    expect(main).toContain("cdp-stage4-2i-ordinary-corrected-interaction");
    expect(main).toContain("cdp-stage4-2i-wavepacket-custody");
    expect(main).toMatch(/factor cancels from Eq\. \(14\)/);
    expect(main).toMatch(/not the primary\s+standard-Diósi test/);
    expect(supplement).toContain("floating-point recovery");
    expect(main).toContain("the four cells, packet metrology,");
    expect(supplement).toContain("### B.11 Stage-4.2I four-cell interaction recovery");
  });

  it("integrates Stage-4.2N as the leading material/Green/FDT ordinary-null chain", () => {
    expect(main).toContain("### 5.5 Material-resolved ordinary complex-coherence null");
    expect(main).toContain("cdp-stage4-2n-complex-ordinary-null");
    expect(main).toContain("cdp-stage4-2n-four-cell-cross-ratio");
    expect(main).toContain("0.01999999999");
    expect(main).toContain("1.34165\\times10^{-6}");
    expect(main).toContain("does not add them to the ordinary");
    expect(main).toContain("supplies no Casimir-to-collapse kernel");
    expect(supplement).toContain("### Stage-4.2N material/Green/FDT ordinary-null recovery");
    expect(supplement).toContain("The runtime adds zero observable bridge edges");
  });

  it("classifies magnetar vacuum birefringence as external QED precedent only", () => {
    expect(main).toContain("**External empirical precedent.**");
    expect(main).toContain("one of five evidence");
    expect(main).toContain("no data replay, parameter transfer");
    expect(main).toContain("do not enter Eq. (18)");
    expect(main).toContain("10.1038/s41586-026-10859-z");
    expect(supplement).toContain("vacuum-to-manifold transfer law");
    expect(supplement).toContain("not as a Casimir apparatus input, data replay, DP/OR");
  });

  it("integrates Stage-4.2O as separate public-data component validation", () => {
    expect(main).toContain("### 5.6 Public-data component validation");
    expect(main).toContain("cdp-stage4-2o-public-fringe-coefficient");
    expect(main).toContain("cdp-stage4-2o-heldout-covariance-residual");
    expect(main).toContain("no shared likelihood, cross-apparatus covariance");
    expect(main).toContain("registered \\(R_0=100\\) nm comparator");
    expect(main).toContain("`not_adjudicated`");
    expect(supplement).toContain("### Stage-4.2O authenticated public-data component replay");
    expect(supplement).toContain("separate_public_dataset_recovery_only");
    expect(supplement).toContain("cross-apparatus covariance fusion");
    expect(proposal).toContain("### Implemented Stage-4.2O public-data component-validation campaign");
    expect(proposal).toContain("Joint-protocol validation and measured evidence remain `not_ready`");
  });

  it("integrates Stage-4.2Q as an ordinary superconducting control and collapse nonbridge", () => {
    expect(main).toContain("### 5.8 Superconducting boundary control: bridge and nonbridges");
    expect(main).toContain("cdp-stage4-2q-london-screening");
    expect(main).toContain("cdp-stage4-2q-finite-impedance");
    expect(main).toContain("cdp-stage4-2q-boundary-ratio");
    expect(main).toContain("The frozen boundary-independent Diósi factor cancels");
    expect(main).toContain("contrast SNR 10.04");
    expect(main).toContain("not an apparatus selection");
    expect(supplement).toContain("### B.17 Stage-4.2Q superconducting-boundary control");
    expect(supplement).toContain("not represented as zero impedance");
    expect(proposal).toContain("Stage 4.2Q then asks whether a normal/superconducting boundary state improves");
    expect(proposal).toContain("cannot replace the primary mass--separation--time Diósi test");
  });

  it("integrates Stage-4.2R as the fail-closed same-apparatus pilot gate", () => {
    expect(main).toContain("### 5.9 Integrated empirical-pilot closure");
    expect(main).toContain("cdp-stage4-2r-diosi-precision-target");
    expect(main).toContain("cdp-stage4-2r-four-cell-cross-ratio");
    expect(main).toContain("all eight joint");
    expect(main).toContain("authorities are absent");
    expect(main).toContain("zero cross-apparatus covariance fusion");
    expect(supplement).toContain("### B.18 Stage-4.2R integrated feasibility-pilot readiness");
    expect(supplement).toContain("0/8 ready authorities");
    expect(proposal).toContain("Stage 4.2R closes the *specification* of the integrated empirical pilot");
    expect(proposal).toContain("The runtime returns `not_authorized` because 0/8 empirical packets are ready");
  });

  it("integrates Stage-4.2S as a causal ordinary-EM propagation closure", () => {
    expect(main).toContain("### 5.10 Retarded-source propagation adds an executable ordinary-physics lane");
    expect(main).toContain("cdp-stage4-2s-retarded-radiation-field");
    expect(main).toContain("cdp-stage4-2s-propagation-scale");
    expect(main).toContain("cdp-stage4-2s-green-to-coherence");
    expect(main).toContain("\\(kL=8.38\\times10^{-13}\\)");
    expect(main).toContain("\\(kL=324.29\\)");
    expect(main).toContain("0/7 authorities");
    expect(main).toMatch(/no\s+radiation-, polarization-, Green-tensor-, frequency-, or Casimir-to-collapse/);
    expect(supplement).toContain("### B.19 Stage-4.2S retarded-source and switching-radiation closure");
    expect(supplement).toContain("cdp-stage4-2s-supplement-radiation");
    expect(supplement).toContain("cdp-stage4-2s-supplement-scale");
    expect(supplement).toContain("cdp-stage4-2s-supplement-green-coherence");
    expect(proposal).toContain("Stage 4.2S sharpens one of those missing packets");
    expect(proposal).toContain("ordinary-null integration and the physical pilot remain unauthorized");
  });

  it("integrates Stage-4.2J as a Schrödinger, density, and environment no-go diagnostic", () => {
    for (const id of [
      "cdp-stage4-2j-schrodinger-coherence-factorization",
      "cdp-stage4-2j-dp-equivalent-energy-inverse",
      "cdp-stage4-2j-homogeneous-sphere-energy",
      "cdp-stage4-2j-residual-gas-screen",
    ]) {
      expect(main).toContain(id);
      expect(supplement).toContain(id);
    }
    expect(main).toContain("0.249896");
    expect(main).toContain("0.434903% transported diagnostic benchmark");
    expect(main).toContain("8.64118\\times10^{-4}");
    expect(main).toContain("0.007320 of the");
    expect(supplement).toContain("0.149851%");
    expect(supplement).toContain("declared-equilibrium gas gate");
    expect(main).toMatch(/not a calorimetric\s+measurement of gravitational energy/);
    expect(main).toMatch(/The full\s+whitened complex estimator/);
    expect(supplement).toContain(
      "### B.12 Stage-4.2J Schrödinger, mass-density, and environment recovery",
    );
    expect(supplement).toMatch(/declared-equilibrium gas gate is\s+`no_go`/);
  });

  it("states the external-bound screen and its convention limitation", () => {
    expect(main).toContain("\\(R_0>4.9\\times10^{-10}\\) m at 90% confidence");
    expect(main).toContain("\\(R_0>4.5\\times10^{-10}\\) m at 95% confidence");
    expect(main).toContain("about 204 times");
    expect(main).toMatch(
      /the\s+mass-density smearing definition, normalization convention, charged-constituent\s+radiation map, and treatment of the effective composite particle/,
    );
  });

  it("downgrades positive interpretation while the companion is infeasible", () => {
    expect(main).toContain("3.07013\\times10^{-40}");
    expect(main).toContain("6.14027\\times10^{-40}");
    expect(main).toContain("Equation (35) is not an instrument model");
    expect(main).toContain(
      "replicated Diósi-shaped coherence residual may be reported as unexplained",
    );
    expect(main).toContain(
      "model-consistent phenomenology, but not as support-eligible identification",
    );
  });

  it("includes publication elements and six scientific figures", () => {
    for (const figure of [
      "apparatus-schematic.svg",
      "timing-sequence.svg",
      "hypothesis-graph.svg",
      "identifiability-geometry.svg",
      "constraint-screen.svg",
      "coherence-forecast.svg",
    ]) {
      expect(main).toContain(figure);
    }
    for (const element of [
      "## Publication declarations",
      "**Author contributions.**",
      "**Code and data availability.**",
      "**Competing interests.**",
      "**Acknowledgments.**",
      "## References",
      "## 13. Conclusion",
    ]) {
      expect(main).toContain(element);
    }
  });

  it("keeps main and supplement equation sidecars in exact parity", () => {
    for (const [markdown, sourcePath, generatedPath, expectedDocPath] of [
      [
        main,
        mainSourcePath,
        mainGeneratedPath,
        "docs/research/casimir-dp-quantum-foam-study.md",
      ],
      [
        supplement,
        supplementSourcePath,
        supplementGeneratedPath,
        "docs/research/casimir-dp-quantum-foam-study-reproducibility-supplement.md",
      ],
    ] as const) {
      const markers = markerIds(markdown);
      const source = loadSidecar(sourcePath);
      const generated = loadSidecar(generatedPath);
      expect(new Set(markers).size).toBe(markers.length);
      expect(source.docPath).toBe(expectedDocPath);
      expect(generated.docPath).toBe(expectedDocPath);
      expect(source.entries.map((entry) => entry.equationId).sort()).toEqual(
        [...markers].sort(),
      );
      expect(generated.entries.map((entry) => entry.equationId).sort()).toEqual(
        [...markers].sort(),
      );
    }
  });

  it("resolves every equation-action badge reference against the global graph", () => {
    const badgeIds = new Set(buildHelixTheoryBadgeGraphV1().badges.map((badge) => badge.id));
    for (const sourcePath of [mainSourcePath, supplementSourcePath]) {
      const source = loadSidecar(sourcePath);
      for (const entry of source.entries) {
        for (const action of entry.actions ?? []) {
          if (action.preferredBadgeId) {
            expect(badgeIds.has(action.preferredBadgeId), `${entry.equationId}:preferredBadgeId`).toBe(true);
          }
          for (const badgeId of action.badgeIds ?? []) {
            expect(badgeIds.has(badgeId), `${entry.equationId}:${badgeId}`).toBe(true);
          }
        }
      }
    }
  });

  it("preserves the long-form audit as a noncanonical supplement", () => {
    expect(supplement).toMatch(
      /^# Reproducibility Supplement: Casimir–Diósi Coherence Feasibility Program/,
    );
    expect(supplement).toContain("## Reproducibility and status ledger");
    expect(supplement).toContain("## 13. Source register");
    expect(supplement).toContain("## 14. Repository evidence map");
    expect(supplement).toContain("## Appendix A. Equation-to-artifact and equation-to-claim map");

    const taxonomy = JSON.parse(
      readFileSync(path.resolve(root, "docs/doc-taxonomy.v1.json"), "utf8"),
    ) as {
      documents: Array<{ path: string; canonical?: boolean; sidecars?: string[] }>;
    };
    expect(
      taxonomy.documents.find((entry) => entry.path.endsWith("quantum-foam-study.md"))
        ?.canonical,
    ).toBe(true);
    expect(
      taxonomy.documents.find((entry) =>
        entry.path.endsWith("quantum-foam-study-reproducibility-supplement.md")
      )?.canonical,
    ).toBe(false);
  });

  it("keeps the canonical article connected to the live Theory Badge graph", () => {
    const graph = buildCasimirDpStudyTheoryBadgesV1();
    expect(graph.badges).toHaveLength(51);
    expect(graph.edges).toHaveLength(150);
    expect(main).toContain("QED-vacuum precedent and the gated bridge");
    expect(main).toContain("cdp-branch-conditioned-total-stress-energy");
    expect(main).toContain("cdp-boundary-metric-response-slot");
    expect(main).toContain("cdp-boundary-conditioned-coherence-extension");
    expect(main).toContain("Conditional evolutionary coherence control");
    expect(main).toContain("cdp-evolutionary-coherence-control-conditional-gate");
    expect(main).toContain("From residual inference to an internal-energy universality successor");
    expect(main).toContain("cdp-composition-universality-successor");
    expect(supplement).toContain("Branch-conditioned stress--metric--coherence chain");
    expect(supplement).toContain("cdp-supplement-evolutionary-coherence-control-conditional-gate");
    expect(supplement).toContain("cdp-supplement-composition-universality-successor");
    expect(
      graph.badges.some((badge) =>
        badge.sourceRefs.some((source) =>
          source.path === "docs/research/casimir-dp-quantum-foam-study.md"
        )
      ),
    ).toBe(true);
    expect(
      graph.badges.some((badge) =>
        badge.id === "study.casimir_dp.penrose_relational_candidate_stage0" &&
        badge.sourceRefs.some((source) =>
          source.path ===
          "docs/research/casimir-dp-penrose-candidate-theory-stage0-report.md"
        )
      ),
    ).toBe(true);
    expect(
      graph.badges.some((badge) =>
        badge.id ===
          "study.casimir_dp.penrose_relational_correspondence_stage0_1" &&
        badge.sourceRefs.some((source) =>
          source.path ===
          "docs/research/casimir-dp-penrose-relational-correspondence-stage0-1-report.md"
        )
      ),
    ).toBe(true);
  });
});
