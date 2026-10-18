import { describe, expect, it } from "vitest";

import { resolveCanonicalFrameworkBindings } from "../scripts/paper-framework-binding";

describe("paper framework binding", () => {
  it("prefers concept-local definition text over shared paper-title contamination", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Unified Formal Framework Linking Molecular Interactions to Tides and Optical Trapping",
      extractionText: "",
      claimTexts: [],
      concepts: [
        {
          concept_id: "decoherence",
          term: "decoherence",
          definition: "environment-induced decoherence and classical bulk observables",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.decoherence?.canonicalId).toBe(
      "physics-quantum-semiclassical-decoherence-classicality-definition",
    );
  });

  it("keeps mixed-source thermodynamics and quantum definitions on their intended ids", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Unified Formal Framework Linking Molecular Interactions to Tides and Optical Trapping",
      extractionText:
        "many-body Hamiltonian effective intermolecular potential pair correlation structure factor virial coefficients classical density functional theory equilibrium tide optical trapping quantum statistics decoherence classical bulk observables",
      claimTexts: [
        "many-body Hamiltonian with external potentials",
        "classical density functional theory in external potentials",
        "equilibrium tide as hydrostatic limit",
        "quantum statistics at thermal de Broglie crossover",
        "decoherence and classical bulk observables",
      ],
      concepts: [
        {
          concept_id: "many_body",
          term: "many-body Hamiltonian",
          definition: "equilibrium many-body statistical mechanics with external potentials",
        },
        {
          concept_id: "cdft",
          term: "classical density functional theory",
          definition: "delta F/delta n + U_ext = mu",
        },
        {
          concept_id: "tide",
          term: "equilibrium tide",
          definition: "hydrostatic tidal-potential limit and equipotential free surface",
        },
        {
          concept_id: "quantum_stats",
          term: "quantum statistics",
          definition: "thermal de Broglie crossover and Bose/Fermi behavior",
        },
        {
          concept_id: "decoherence",
          term: "decoherence",
          definition: "environment-induced decoherence and classical bulk observables",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.many_body?.canonicalId).toBe(
      "physics-thermodynamics-many-body-hamiltonian-definition",
    );
    expect(bindings.concept.cdft?.canonicalId).toBe(
      "physics-thermodynamics-classical-density-functional-response-definition",
    );
    expect(bindings.concept.tide?.canonicalId).toBe("physics-thermodynamics-equilibrium-tide-definition");
    expect(bindings.concept.quantum_stats?.canonicalId).toBe(
      "physics-quantum-semiclassical-quantum-statistics-definition",
    );
    expect(bindings.concept.decoherence?.canonicalId).toBe(
      "physics-quantum-semiclassical-decoherence-classicality-definition",
    );
  });

  it("binds the shared microphysics Hamiltonian transport backbone to the dedicated parent ids", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Microphysics Hamiltonian transport observables",
      extractionText:
        "effective microphysics effective interaction Hamiltonian many-body Hamiltonian kinetic transport closure constitutive response plasma transport closure collective observable response",
      claimTexts: [
        "Effective microphysics supplies the conservative Hamiltonian backbone.",
        "Kinetic transport closure and constitutive response mediate coarse-grained observables.",
        "Plasma transport closure is the stellar-side analog of the shared parent backbone.",
      ],
      concepts: [
        {
          concept_id: "microphysics",
          term: "effective microphysics",
          definition: "effective microphysics bridge from particle physics to coarse-grained transport",
        },
        {
          concept_id: "hamiltonian",
          term: "effective interaction Hamiltonian",
          definition: "many-body interaction Hamiltonian and conservative backbone",
        },
        {
          concept_id: "transport",
          term: "kinetic transport closure",
          definition: "coarse-grained closure for transport and response",
        },
        {
          concept_id: "constitutive",
          term: "constitutive response",
          definition: "bulk constitutive response under stress",
        },
        {
          concept_id: "plasma",
          term: "plasma transport closure",
          definition: "stellar plasma transport closure and equation-of-state support",
        },
        {
          concept_id: "observable",
          term: "collective observable response",
          definition: "observable response in macroscopic systems",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.microphysics?.canonicalId).toBe(
      "physics-microphysics-transport-effective-microphysics-definition",
    );
    expect(bindings.concept.hamiltonian?.canonicalId).toBe(
      "physics-microphysics-transport-effective-interaction-hamiltonian-definition",
    );
    expect(bindings.concept.transport?.canonicalId).toBe(
      "physics-microphysics-transport-kinetic-transport-closure-definition",
    );
    expect(bindings.concept.constitutive?.canonicalId).toBe(
      "physics-microphysics-transport-constitutive-response-definition",
    );
    expect(bindings.concept.plasma?.canonicalId).toBe(
      "physics-microphysics-transport-plasma-transport-closure-definition",
    );
    expect(bindings.concept.observable?.canonicalId).toBe(
      "physics-microphysics-transport-collective-observable-response-definition",
    );
  });

  it("binds warp-family definitions to warp mechanics definition anchors", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Geometry comparison of Alcubierre, Natario, and Van Den Broeck warp metrics",
      extractionText:
        "The source compares the Alcubierre metric, Natario zero-expansion construction, the shift vector and expansion scalar, and the Van Den Broeck compression factor.",
      claimTexts: [],
      concepts: [
        {
          concept_id: "alcubierre",
          term: "Alcubierre metric",
          definition: "canonical shift-only warp spacetime with expansion and contraction regions",
        },
        {
          concept_id: "natario",
          term: "Natario zero-expansion",
          definition: "warp drive with zero expansion using a divergence-free shift field",
        },
        {
          concept_id: "shift",
          term: "shift vector and expansion scalar",
          definition: "ADM shift vector semantics and theta expansion control for a warp geometry",
        },
        {
          concept_id: "vdb",
          term: "Van Den Broeck compression factor",
          definition: "pocket geometry compression factor gamma_vdb for reduced energy requirements",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.alcubierre?.canonicalId).toBe("alcubierre-metric");
    expect(bindings.concept.natario?.canonicalId).toBe("natario-zero-expansion");
    expect(bindings.concept.shift?.canonicalId).toBe("shift-vector-expansion-scalar");
    expect(bindings.concept.vdb?.canonicalId).toBe("vdb-compression-factor");
  });

  it("separates equilibrium tide, lunisolar forcing, and Earth-axis response into the intended ids", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Moon and Sun forcing from tides to Earth-axis precession",
      extractionText:
        "tide-generating potential tractive force equilibrium tide dynamic tide equatorial bulge torque precession of the equinoxes nutation",
      claimTexts: [
        "The equilibrium tide is the hydrostatic equipotential limit.",
        "The tide-generating potential comes from Moon and Sun differential gravity.",
        "Earth axial precession is driven by torque on the equatorial bulge.",
        "Nutation is the shorter-period modulation of that axis motion.",
      ],
      concepts: [
        {
          concept_id: "equilibrium",
          term: "equilibrium tide",
          definition: "hydrostatic equipotential free-surface response to tidal potential",
        },
        {
          concept_id: "forcing",
          term: "lunisolar tide-generating potential",
          definition: "tractive force and differential Moon/Sun forcing with inverse-cube scaling",
        },
        {
          concept_id: "dynamic",
          term: "dynamic tide",
          definition: "forced-dissipative rotating shallow-water response of the ocean",
        },
        {
          concept_id: "torque",
          term: "equatorial bulge torque",
          definition: "Moon and Sun torque on Earth's oblateness",
        },
        {
          concept_id: "precession",
          term: "Earth axial precession",
          definition: "precession of the equinoxes from torque on Earth's equatorial bulge",
        },
        {
          concept_id: "nutation",
          term: "Earth nutation",
          definition: "shorter-period spin-axis modulation from the Moon's tilted elliptical orbit",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.equilibrium?.canonicalId).toBe("physics-thermodynamics-equilibrium-tide-definition");
    expect(bindings.concept.forcing?.canonicalId).toBe(
      "physics-gravitational-response-lunisolar-tide-potential-definition",
    );
    expect(bindings.concept.dynamic?.canonicalId).toBe("physics-gravitational-response-dynamic-tide-definition");
    expect(bindings.concept.torque?.canonicalId).toBe(
      "physics-gravitational-response-equatorial-bulge-torque-definition",
    );
    expect(bindings.concept.precession?.canonicalId).toBe(
      "physics-gravitational-response-earth-axial-precession-definition",
    );
    expect(bindings.concept.nutation?.canonicalId).toBe(
      "physics-gravitational-response-earth-nutation-definition",
    );
  });

  it("binds self-gravity and stellar-structure concepts to their dedicated lanes", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Gravitating matter from hydrostatic rounding to stellar burning",
      extractionText:
        "self gravity internal pressure material strength hydrostatic equilibrium shape rotational flattening potato radius stellar hydrostatic equilibrium stellar equation of state stellar opacity nuclear reaction rates hydrogen burning stellar nucleosynthesis composition feedback",
      claimTexts: [
        "The potato radius is a strength-versus-self-gravity threshold.",
        "Rotational flattening modifies the hydrostatic figure.",
        "Stellar hydrostatic equilibrium balances gravity against pressure.",
        "Stellar nucleosynthesis proceeds through staged burning and abundance feedback.",
      ],
      concepts: [
        {
          concept_id: "potato",
          term: "potato radius transition",
          definition: "approximate threshold where self gravity overcomes material strength and irregular bodies round",
        },
        {
          concept_id: "flattening",
          term: "rotational flattening",
          definition: "equatorial oblateness from centrifugal support in a hydrostatic body",
        },
        {
          concept_id: "stellar_hydro",
          term: "stellar hydrostatic equilibrium",
          definition: "pressure gradients balance inward gravity inside a star",
        },
        {
          concept_id: "stellar_nucleo",
          term: "stellar nucleosynthesis",
          definition: "stage-ordered element creation through stellar burning and reaction networks",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.potato?.canonicalId).toBe(
      "physics-self-gravity-shape-potato-radius-transition-definition",
    );
    expect(bindings.concept.flattening?.canonicalId).toBe(
      "physics-self-gravity-shape-rotational-flattening-definition",
    );
    expect(bindings.concept.stellar_hydro?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-stellar-hydrostatic-equilibrium-definition",
    );
    expect(bindings.concept.stellar_nucleo?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-stellar-nucleosynthesis-definition",
    );
  });

  it("binds gravity-to-deformation bridge concepts to the intended ids", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "From tidal tensors to shape coefficients and precession constants",
      extractionText:
        "tidal tensor love number constitutive response J2 dynamical ellipticity precession constant",
      claimTexts: [
        "The tidal tensor is the second derivative of the weak-field potential.",
        "Love numbers summarize tidal deformability.",
        "Constitutive response closes the deformation law.",
        "J2 encodes quadrupole oblateness while dynamical ellipticity and precession constants connect shape to orientation response.",
      ],
      concepts: [
        {
          concept_id: "tidal_tensor",
          term: "tidal tensor",
          definition: "gravity gradient tensor from the second derivative of the gravitational potential",
        },
        {
          concept_id: "love_number",
          term: "Love number",
          definition: "dimensionless tidal response coefficient such as k2",
        },
        {
          concept_id: "constitutive",
          term: "constitutive response",
          definition: "material closure relating stress, strain, pressure, and rheology",
        },
        {
          concept_id: "j2",
          term: "J2",
          definition: "dimensionless quadrupole gravity coefficient of oblateness",
        },
        {
          concept_id: "ellipticity",
          term: "dynamical ellipticity",
          definition: "inertia asymmetry H = (C - A)/C used in Earth orientation response",
        },
        {
          concept_id: "precession_constant",
          term: "precession constant",
          definition: "lunisolar torque mapped into spin-axis precession-rate scaling",
        },
        {
          concept_id: "figure_diag",
          term: "planetary figure diagnostic",
          definition: "earth-like low-order figure closure over q J2 H k2 and flattening",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.tidal_tensor?.canonicalId).toBe(
      "physics-gravitational-response-tidal-tensor-definition",
    );
    expect(bindings.concept.love_number?.canonicalId).toBe(
      "physics-gravitational-response-love-number-definition",
    );
    expect(bindings.concept.constitutive?.canonicalId).toBe(
      "physics-microphysics-transport-constitutive-response-definition",
    );
    expect(bindings.concept.j2?.canonicalId).toBe("physics-self-gravity-shape-J2-definition");
    expect(bindings.concept.ellipticity?.canonicalId).toBe(
      "physics-gravitational-response-dynamical-ellipticity-definition",
    );
    expect(bindings.concept.precession_constant?.canonicalId).toBe(
      "physics-gravitational-response-precession-constant-definition",
    );
    expect(bindings.concept.figure_diag?.canonicalId).toBe(
      "physics-self-gravity-shape-planetary-figure-diagnostic",
    );
  });

  it("binds granular tidal-response concepts to the intended self-gravity lane ids", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Granular dissipation and tidal spin evolution in rubble-pile bodies",
      extractionText:
        "granular collision dissipation porous rubble-pile rheology tidal quality factor spin state evolution angular momentum redistribution",
      claimTexts: [
        "Multiparticle collisions and friction act as the bulk dissipation channel in rubble-pile bodies.",
        "Effective rubble-pile rheology sets tidal Q, phase lag, and spin-state evolution.",
        "Tidal angular momentum redistribution links lag to rotational-state change.",
      ],
      concepts: [
        {
          concept_id: "granular",
          term: "granular collision dissipation",
          definition: "inelastic grain contacts and rearrangements that dissipate energy in a rubble-pile body",
        },
        {
          concept_id: "rheology",
          term: "porous rubble-pile rheology",
          definition: "effective bulk rheology of a porous self-gravitating granular aggregate",
        },
        {
          concept_id: "quality_factor",
          term: "tidal quality factor",
          definition: "dimensionless dissipation and phase-lag closure often discussed through Q and k2 over Q",
        },
        {
          concept_id: "spin",
          term: "spin state evolution",
          definition: "torque-driven spin-up or despinning response under tidal forcing",
        },
        {
          concept_id: "angular_momentum",
          term: "angular momentum redistribution",
          definition: "spin-orbit angular momentum exchange and redistribution in a tidally evolving body",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.granular?.canonicalId).toBe(
      "physics-self-gravity-shape-granular-collision-dissipation-definition",
    );
    expect(bindings.concept.rheology?.canonicalId).toBe(
      "physics-self-gravity-shape-porous-rubble-pile-rheology-definition",
    );
    expect(bindings.concept.quality_factor?.canonicalId).toBe(
      "physics-self-gravity-shape-tidal-quality-factor-definition",
    );
    expect(bindings.concept.spin?.canonicalId).toBe(
      "physics-self-gravity-shape-spin-state-evolution-definition",
    );
    expect(bindings.concept.angular_momentum?.canonicalId).toBe(
      "physics-self-gravity-shape-angular-momentum-redistribution-definition",
    );
  });

  it("keeps astrochemistry, dopamine biology, and orch-or hypotheses on their intended targets", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "From stellar carbon chemistry to dopamine signaling and speculative consciousness hypotheses",
      extractionText:
        "stellar carbon synthesis interstellar aromatic carbon chemistry polycyclic aromatic hydrocarbon chemistry meteoritic prebiotic organic delivery catecholamine biosynthesis dopamine reward prediction error orch or hypothesis microtubule quantum coherence",
      claimTexts: [
        "Carbon made in stars feeds later aromatic chemistry in space.",
        "Meteorite organics contribute to prebiotic inventory without implying extraterrestrial dopamine.",
        "Dopamine participates in reward prediction signaling.",
        "Orch-OR remains an exploratory consciousness hypothesis.",
      ],
      concepts: [
        {
          concept_id: "carbon",
          term: "stellar carbon synthesis",
          definition: "carbon production in stellar interiors before later astrochemistry",
        },
        {
          concept_id: "delivery",
          term: "meteoritic prebiotic organic delivery",
          definition: "exogenous delivery of stable organics from meteorites into prebiotic inventories",
        },
        {
          concept_id: "dopamine",
          term: "dopamine reward signaling",
          definition: "reward prediction error and reinforcement signaling in dopamine pathways",
        },
        {
          concept_id: "orchor",
          term: "Orch-OR hypothesis",
          definition: "Hameroff Penrose microtubule quantum coherence and orchestrated objective reduction",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.carbon?.canonicalId).toBe("stellar-carbon-synthesis");
    expect(bindings.concept.delivery?.canonicalId).toBe("meteoritic-prebiotic-organic-delivery");
    expect(bindings.concept.dopamine?.canonicalId).toBe("dopamine-reward-signaling");
    expect(bindings.concept.orchor?.canonicalId).toBe("orch-or-hypothesis");
  });

  it("keeps stellar coherence bridges separate from direct orch-or hypothesis binding", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Bridge constraints from Orch-OR ideas into stellar coherence",
      extractionText: "stellar coherence bridge solar coherence bridge no feasibility claims orch or to stellar coherence",
      claimTexts: ["A bridge from Orch-OR style speculation into stellar coherence remains constrained and non-certifying."],
      concepts: [
        {
          concept_id: "stellar_bridge",
          term: "stellar coherence bridge",
          definition: "stellar coherence bridge with solar coherence constraints and no feasibility claims",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.stellar_bridge?.canonicalId).toBe("bridge-orch-or-to-stellar-coherence");
  });

  it("binds the exploratory microtubule-time-crystal packet to quantum nodes without leaking into stellar or granular lanes", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Microtubule time crystals, triplet hierarchies, and gravity-related collapse",
      extractionText:
        "microtubule quantum coherence microtubule time crystal triplet of triplets polyatomic time crystal scale free resonance hierarchy spacetime triplet geometry gravity related collapse gravitational time dilation decoherence driven dissipative time crystal subharmonic locking robustness window no-go theorem",
      claimTexts: [
        "The paper discusses an exploratory microtubule/time-crystal hypothesis family.",
        "The gravity-related and time-crystal statements remain comparison hypotheses only.",
        "The lane must stay outside stellar flare, sunquake, and granular tide semantics.",
      ],
      concepts: [
        {
          concept_id: "microtubule",
          term: "microtubule quantum coherence",
          definition: "microtubule coherence and Orch-OR-style exploratory claims",
        },
        {
          concept_id: "triplet",
          term: "triplet of triplets",
          definition: "nested resonance hierarchy and scale-free resonance pattern",
        },
        {
          concept_id: "polyatomic",
          term: "polyatomic time crystal",
          definition: "driven dissipative time-crystal style claim family",
        },
        {
          concept_id: "bandyopadhyay",
          term: "Anirban Bandyopadhyay",
          definition: "exploratory microtubule triplet-hierarchy and time-crystal proposal family",
        },
        {
          concept_id: "saxena",
          term: "Saxena",
          definition: "polyatomic time-crystal and scale-free resonance hierarchy proposal family",
        },
        {
          concept_id: "triplet_hierarchy",
          term: "triplet hierarchy",
          definition: "nested resonance hierarchy of triplets across scales",
        },
        {
          concept_id: "gravity_collapse",
          term: "gravity-related collapse",
          definition: "Diosi-Penrose style gravity-related collapse proposal",
        },
        {
          concept_id: "decoherence",
          term: "gravitational time dilation decoherence",
          definition: "gravity-linked decoherence mechanism",
        },
        {
          concept_id: "time_crystal",
          term: "driven dissipative time crystal",
          definition: "open-system time-crystal criteria and subharmonic locking",
        },
      ],
      systems: [],
      equations: [],
    });

    const exploratoryQuantumIds = new Set([
      "orch-or-hypothesis",
      "quantum-consciousness-hypothesis",
      "physics-quantum-semiclassical-stochastic-open-quantum-dynamics-definition",
      "physics-quantum-semiclassical-decoherence-classicality-definition",
    ]);

    expect(bindings.concept.microtubule?.canonicalId).toBe("orch-or-hypothesis");
    expect(exploratoryQuantumIds.has(bindings.concept.triplet?.canonicalId ?? "")).toBe(true);
    expect(exploratoryQuantumIds.has(bindings.concept.polyatomic?.canonicalId ?? "")).toBe(true);
    expect(exploratoryQuantumIds.has(bindings.concept.bandyopadhyay?.canonicalId ?? "")).toBe(true);
    expect(exploratoryQuantumIds.has(bindings.concept.saxena?.canonicalId ?? "")).toBe(true);
    expect(exploratoryQuantumIds.has(bindings.concept.triplet_hierarchy?.canonicalId ?? "")).toBe(true);
    expect(exploratoryQuantumIds.has(bindings.concept.gravity_collapse?.canonicalId ?? "")).toBe(true);
    expect(bindings.concept.decoherence?.canonicalId).toBe(
      "physics-quantum-semiclassical-decoherence-classicality-definition",
    );
    expect(bindings.concept.time_crystal?.canonicalId).toBe(
      "physics-quantum-semiclassical-stochastic-open-quantum-dynamics-definition",
    );
    expect(bindings.concept.microtubule?.canonicalId).not.toMatch(/^physics-stellar-|^physics-self-gravity-/);
    expect(bindings.concept.triplet?.canonicalId).not.toMatch(/^physics-stellar-|^physics-self-gravity-/);
    expect(bindings.concept.bandyopadhyay?.canonicalId).not.toMatch(/^physics-stellar-|^physics-self-gravity-/);
    expect(bindings.concept.saxena?.canonicalId).not.toMatch(/^physics-stellar-|^physics-self-gravity-/);
    expect(bindings.concept.triplet_hierarchy?.canonicalId).not.toMatch(/^physics-stellar-|^physics-self-gravity-/);
  });

  it("binds stellar observables and exploratory collapse math without leaking into consciousness ids", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Stellar oscillations, solar dynamo, and stochastic collapse math",
      extractionText:
        "stellar oscillation helioseismology solar dynamo magnetic cycle magnetic reconnection flare avalanche multiscale plasma variability stochastic open quantum dynamics stochastic schrodinger equation continuous spontaneous localization colored noise collapse stellar plasma observables not consciousness",
      claimTexts: [
        "Helioseismology uses oscillation spectra to probe the solar interior.",
        "The solar dynamo feeds the magnetic cycle, reconnection, and flare statistics.",
        "Stochastic open-system quantum dynamics and CSL remain exploratory model classes.",
        "Stellar plasma observables are not direct consciousness evidence.",
      ],
      concepts: [
        {
          concept_id: "oscillation",
          term: "stellar oscillation",
          definition: "global p-mode and g-mode stellar variability",
        },
        {
          concept_id: "helio",
          term: "helioseismology",
          definition: "use of solar oscillation inversions to infer interior structure",
        },
        {
          concept_id: "dynamo",
          term: "solar dynamo",
          definition: "rotation convection magnetic-field generation in the Sun",
        },
        {
          concept_id: "cycle",
          term: "magnetic cycle",
          definition: "sunspot-cycle and polarity-reversal activity modulation",
        },
        {
          concept_id: "reconnection",
          term: "magnetic reconnection",
          definition: "topological magnetic-field release in the stellar atmosphere",
        },
        {
          concept_id: "flare",
          term: "flare avalanche",
          definition: "cascade statistics of flare populations in a driven magnetic system",
        },
        {
          concept_id: "variability",
          term: "multiscale plasma variability",
          definition: "combined oscillation dynamo reconnection variability stack",
        },
        {
          concept_id: "open_quantum",
          term: "stochastic open quantum dynamics",
          definition: "family of stochastic open-system collapse-model descriptions",
        },
        {
          concept_id: "sse",
          term: "stochastic Schrodinger equation",
          definition: "stochastic pure-state evolution in an open quantum system",
        },
        {
          concept_id: "csl",
          term: "continuous spontaneous localization",
          definition: "CSL collapse-model family based on localization dynamics",
        },
        {
          concept_id: "colored_noise",
          term: "colored noise collapse",
          definition: "non-Markovian colored-noise collapse hypothesis",
        },
        {
          concept_id: "guardrail",
          term: "stellar plasma observables not consciousness",
          definition: "guardrail that blocks direct consciousness inference from stellar plasma observables",
        },
        {
          concept_id: "stellar_diag",
          term: "stellar observables diagnostic",
          definition: "diagnostic coupling between magnetic activity and helioseismic shifts with optional flare statistics",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.oscillation?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-stellar-oscillation-definition",
    );
    expect(bindings.concept.helio?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-helioseismology-definition",
    );
    expect(bindings.concept.dynamo?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-solar-dynamo-definition",
    );
    expect(bindings.concept.cycle?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-magnetic-cycle-definition",
    );
    expect(bindings.concept.reconnection?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-magnetic-reconnection-definition",
    );
    expect(bindings.concept.flare?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-flare-avalanche-definition",
    );
    expect(bindings.concept.variability?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-multiscale-plasma-variability-definition",
    );
    expect(bindings.concept.open_quantum?.canonicalId).toBe(
      "physics-quantum-semiclassical-stochastic-open-quantum-dynamics-definition",
    );
    expect(bindings.concept.sse?.canonicalId).toBe(
      "physics-quantum-semiclassical-stochastic-schrodinger-equation-definition",
    );
    expect(bindings.concept.csl?.canonicalId).toBe("physics-quantum-semiclassical-csl-definition");
    expect(bindings.concept.colored_noise?.canonicalId).toBe(
      "physics-quantum-semiclassical-colored-noise-collapse-hypothesis",
    );
    expect(bindings.concept.guardrail?.canonicalId).toBe("stellar-plasma-observables-not-consciousness");
    expect(bindings.concept.stellar_diag?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-stellar-observables-diagnostic",
    );
  });

  it("binds flare-sunquake observables to the stellar lane while preserving the collapse guardrail", async () => {
    const { bindings } = await resolveCanonicalFrameworkBindings({
      title: "Granulation, nanoflares, and sunquake timing observables",
      extractionText:
        "granulation-driven p-mode pumping nanoflare heating flare particle precipitation sunquake flare-sunquake timing correlation quasi-periodic flare envelope magnetic striation hierarchy sunquake not quantum collapse",
      claimTexts: [
        "Granulation pumps the five-minute p-mode band.",
        "Nanoflare heating and particle precipitation remain energy-transport observables in the flare lane.",
        "Flare-to-sunquake timing correlation and quasi-periodic flare envelopes are replayable diagnostics.",
        "Sunquake observables do not constitute quantum collapse evidence.",
      ],
      concepts: [
        {
          concept_id: "granulation",
          term: "granulation-driven p-mode pumping",
          definition: "granulation and convection driving the five-minute p-mode excitation band",
        },
        {
          concept_id: "nanoflare",
          term: "nanoflare heating",
          definition: "impulsive small-scale magnetic heating in the coronal energy-release lane",
        },
        {
          concept_id: "precipitation",
          term: "flare particle precipitation",
          definition: "flare-driven particle precipitation and chromospheric energy deposition",
        },
        {
          concept_id: "sunquake",
          term: "sunquake",
          definition: "flare-driven helioseismic transient and solar seismic response",
        },
        {
          concept_id: "timing",
          term: "flare-sunquake timing correlation",
          definition: "timing alignment between impulsive flare signatures and sunquake response",
        },
        {
          concept_id: "envelope",
          term: "quasi-periodic flare envelope",
          definition: "quasi-periodic flare burst and pulsation-envelope structure",
        },
        {
          concept_id: "striation",
          term: "magnetic striation hierarchy",
          definition: "multiscale magnetic-striation morphology used as weak observational context",
        },
        {
          concept_id: "guardrail",
          term: "sunquake not quantum collapse",
          definition: "guardrail that blocks any promotion of sunquake observables into collapse or consciousness claims",
        },
      ],
      systems: [],
      equations: [],
    });

    expect(bindings.concept.granulation?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-granulation-driven-pmode-pumping-definition",
    );
    expect(bindings.concept.nanoflare?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-nanoflare-heating-definition",
    );
    expect(bindings.concept.precipitation?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-flare-particle-precipitation-definition",
    );
    expect(bindings.concept.sunquake?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-sunquake-definition",
    );
    expect(bindings.concept.timing?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-flare-sunquake-timing-correlation-definition",
    );
    expect(bindings.concept.envelope?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-quasi-periodic-flare-envelope-definition",
    );
    expect(bindings.concept.striation?.canonicalId).toBe(
      "physics-stellar-structure-nucleosynthesis-magnetic-striation-hierarchy-definition",
    );
    expect(bindings.concept.guardrail?.canonicalId).toBe("sunquake_not_quantum_collapse");
  });
});
