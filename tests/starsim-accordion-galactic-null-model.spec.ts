import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadGaiaStructureImport } from "../server/modules/starsim/accordion/gaia-structure-import";
import {
  runStarSimAccordionGalacticNullModel,
  starSimAccordionGalacticNullPlanSchema,
} from "../shared/starsim-accordion-galactic-null-model";

function loadPlan(path = "tests/fixtures/starsim-accordion/accordion-local-volume.fixture.json") {
  return starSimAccordionGalacticNullPlanSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

describe("StarSim Accordion galactic null model", () => {
  it("attaches StarSim fusion labels to Accordion star-map nodes", () => {
    const evaluation = runStarSimAccordionGalacticNullModel(loadPlan());
    expect(evaluation.starPopulation.nodes[0].fusionPrior.dominantFusionChannel).toBe("pp_chain");
    expect(evaluation.starPopulation.nodes[0].qstAnnotation.qstRole).toBe("astrophysical_population_prior");
    expect(evaluation.starPopulation.populationSummary.fusionChannelHistogram.pp_chain).toBe(1);
  });

  it("maps star positions and fusion to priors only", () => {
    const evaluation = runStarSimAccordionGalacticNullModel(loadPlan());
    expect(evaluation.qstBoundary.spacetimeCL).toBe("proxy_only");
    expect(evaluation.qstBoundary.mayPromoteToCL4).toBe(false);
    expect(evaluation.qstBoundary.caveat).toBe("erDensityProxy_is_not_wormhole_density");
    expect(evaluation.galacticDynamics.preferredInterpretation).toBe("none");
  });

  it("imports Gaia-like structure as population prior with inferred fusion labels", () => {
    const nodes = loadGaiaStructureImport("tests/fixtures/starsim-accordion/gaia-star-population.fixture.json");
    expect(nodes[0].fusionPrior.dominantFusionChannel).toBe("pp_chain");
    expect(nodes[1].fusionPrior.dominantFusionChannel).toBe("compact_object_not_fusing");
  });

  it("distinguishes thermonuclear fusion from quantum-information fusion", () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/starsim-accordion/quantum-fusion-term-guardrail.fixture.json", "utf8"));
    expect(fixture.allowedMapping).toBe("separate_terms_same_word");
    expect(fixture.blockedMapping).toBe("stellar_fusion_as_er_epr_entanglement");
  });

  it("blocks direct ER=EPR overclaims", () => {
    const blocked = loadPlan("tests/fixtures/starsim-accordion/blocked-er-epr-overclaim.fixture.json");
    expect(() => runStarSimAccordionGalacticNullModel(blocked)).toThrow(/direct ER=EPR/);
  });
});
