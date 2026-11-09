// Cinderpine Express — Fairground Diorama, Attractions, Guests & FX (CPE.PARK)
(function () {
  'use strict';

  const CPE = (window.CPE = window.CPE || {});

  // ---------------------------------------------------------------------------
  // Palette & Material Fallbacks
  // ---------------------------------------------------------------------------
  const DEFAULT_PALETTE = {
    GRASS_DRY: 0xc8963e,
    GRASS_OLIVE: 0x8c7a36,
    GRASS_MOSS: 0x5a6332,
    DIRT_PATH: 0xa47449,
    COBBLESTONE: 0x7d6b65,
    PLUM_ROCK_LIGHT: 0x6e4f63,
    PLUM_ROCK: 0x4d354c,
    PLUM_ROCK_DARK: 0x2f1e36,
    BRICK_RED: 0x9e3b2b,
    BRICK_DARK: 0x6e241b,
    CHERRY_RED: 0xd9383a,
    CREAM: 0xf4e9d1,
    BRASS: 0xd9a33c,
    GOLD: 0xf2c94c,
    TIMBER_LIGHT: 0xb57c4a,
    TIMBER_MID: 0x8c5832,
    TIMBER_DARK: 0x59361e,
    STEEL_TEAL: 0x367a82,
    STEEL_DARK: 0x2b3642,
    SLATE_ROOF: 0x3b4254,
    FOLIAGE_GOLD: 0xe59f28,
    FOLIAGE_ORANGE: 0xd65f24,
    FOLIAGE_CRIMSON: 0xa82828,
    FOLIAGE_PINE: 0x2e4d38,
    WARM_GLOW: 0xffd275
  };

  function P() {
    return Object.assign({}, DEFAULT_PALETTE, CPE.PALETTE || {});
  }

  const localGlowRegistry = [];
  const matCache = new Map();

  function makeMat(hex, opts) {
    if (CPE.makeMat && (!opts || Object.keys(opts).length === 0)) {
      return CPE.makeMat(hex, opts);
    }
    const key = hex + '_' + JSON.stringify(opts || {});
    if (matCache.has(key)) return matCache.get(key);
    const params = Object.assign({ color: hex, flatShading: true }, opts || {});
    const mat = CPE.makeMat ? CPE.makeMat(hex, opts) : new THREE.MeshLambertMaterial(params);
    matCache.set(key, mat);
    return mat;
  }

  function makeGlowMat(hex, dayIntensity, nightIntensity) {
    const dInt = dayIntensity !== undefined ? dayIntensity : 0.12;
    const nInt = nightIntensity !== undefined ? nightIntensity : 1.0;
    let mat;
    if (CPE.makeGlowMat) {
      mat = CPE.makeGlowMat(hex, nInt);
    } else {
      mat = new THREE.MeshLambertMaterial({
        color: hex,
        emissive: new THREE.Color(hex),
        emissiveIntensity: dInt,
        flatShading: true
      });
    }
    if (CPE.registerGlowMaterial) {
      CPE.registerGlowMaterial(mat, hex, dInt, nInt);
    }
    localGlowRegistry.push({ mat, baseColor: new THREE.Color(hex), dayInt: dInt, nightInt: nInt, registered: !!CPE.registerGlowMaterial });
    return mat;
  }

  function updateLocalGlowMaterials(nightFactor) {
    const nf = Math.max(0, Math.min(1, nightFactor || 0));
    for (let i = 0; i < localGlowRegistry.length; i++) {
      const entry = localGlowRegistry[i];
      if (!entry.registered && CPE.registerGlowMaterial) {
        CPE.registerGlowMaterial(entry.mat, entry.baseColor.getHex(), entry.dayInt, entry.nightInt);
        entry.registered = true;
      }
      if (entry.mat && entry.mat.emissive) {
        entry.mat.emissiveIntensity = entry.dayInt + (entry.nightInt - entry.dayInt) * nf;
      }
    }
  }

  // Deterministic PRNG so park details are consistent and repeatable
  let seed = 421337;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function randRange(min, max) {
    return min + rand() * (max - min);
  }

  // ---------------------------------------------------------------------------
  // CPE.WORLD Terrain & Avoidance Helpers (shared with track/supports)
  // ---------------------------------------------------------------------------
  CPE.WORLD = CPE.WORLD || {};

  const HILL_CENTER_X = 24.5;
  const HILL_CENTER_Z = -17.5;
  const HILL_RADIUS = 13.0;
  const HILL_PEAK_Y = 9.5;

  if (!CPE.WORLD.getRockHillHeight) {
    CPE.WORLD.getRockHillHeight = function (x, z) {
      const dx = x - HILL_CENTER_X;
      const dz = z - HILL_CENTER_Z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= HILL_RADIUS * HILL_RADIUS) return 0;
      const d = Math.sqrt(d2);
      const t = 1 - d / HILL_RADIUS;
      const ridge = 0.65 * Math.sin(dx * 0.45) * Math.cos(dz * 0.45);
      return Math.max(0, HILL_PEAK_Y * (t * t * (3 - 2 * t)) + ridge * t);
    };
  }

  if (!CPE.WORLD.getTerrainHeight) {
    CPE.WORLD.getTerrainHeight = function (x, z) {
      return CPE.WORLD.getRockHillHeight(x, z);
    };
  }

  if (!CPE.WORLD.getGroundY) {
    CPE.WORLD.getGroundY = function (x, z) {
      return CPE.WORLD.getRockHillHeight(x, z);
    };
  }

  if (!CPE.WORLD.isOverPathOrQueue) {
    CPE.WORLD.isOverPathOrQueue = function (x, z) {
      // Switchback queue zone
      if (x >= -11.5 && x <= 2.5 && z >= 16.5 && z <= 27.5) return true;
      // Southern promenade footpath
      if (x >= -42 && x <= 14 && z >= 21.5 && z <= 26.5) return true;
      // Main North-South midway avenue
      if (x >= -29.5 && x <= -21.0 && z >= -26 && z <= 27) return true;
      // Central plaza & fountain square
      if (x >= -36 && x <= -20 && z >= 2 && z <= 14) return true;
      return false;
    };
  }

  if (!CPE.WORLD.trainPos) {
    CPE.WORLD.trainPos = new THREE.Vector3(-1, 2.2, 14);
  }
  if (CPE.WORLD.trainSpeed === undefined) {
    CPE.WORLD.trainSpeed = 0;
  }

  // ---------------------------------------------------------------------------
  // Park State & Animated References
  // ---------------------------------------------------------------------------
  let parkGroup = null;
  let satelliteIslets = [];
  let ferrisWheelGroup = null;
  let ferrisGondolas = [];
  let carouselPlatformGroup = null;
  let carouselMounts = [];
  let fountainDrops = [];
  let fountainMesh = null;
  let smokePuffs = [];
  let marqueeBulbs = [];
  let minePortalsBuilt = false;
  let minePortalGroup = null;

  // Instanced Guests
  const GUEST_COUNT = 140;
  let guestMeshes = null;
  let guests = [];

  // Instanced Falling Leaves
  const LEAF_COUNT = 180;
  let leafMesh = null;
  let leaves = [];

  // Night Fireworks
  const FIREWORK_PARTICLES_PER_BURST = 45;
  const MAX_BURSTS = 3;
  const TOTAL_FW_PARTICLES = FIREWORK_PARTICLES_PER_BURST * MAX_BURSTS + 4; // +4 for ascending shells
  let fireworkMesh = null;
  let fireworkBursts = [];
  let fireworkRockets = [];
  let nextFireworkTimer = 1.6;

  // Dummy matrix helper
  const _dummy = new THREE.Object3D();
  const _vec3 = new THREE.Vector3();
  const _color = new THREE.Color();
  const _quat = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);

  // ---------------------------------------------------------------------------
  // 1. Floating Island Slab, Grass Patches, Footpaths & Cliff Rim
  // ---------------------------------------------------------------------------
  function createRoundedRectShape(width, depth, radius) {
    const shape = new THREE.Shape();
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const r = Math.min(radius, hw, hd);

    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    return shape;
  }

  function buildFloatingIsland(root) {
    const pal = P();
    const islandGroup = new THREE.Group();
    islandGroup.name = 'FloatingIsland';

    // Top turf slab: X in [-54, 54] (108m), Z in [-38, 38] (76m), corner radius 8m, top at Y = 0
    const topShape = createRoundedRectShape(108, 76, 8);
    const slabExtrude = new THREE.ExtrudeGeometry(topShape, {
      depth: 1.6,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.4,
      bevelSegments: 2,
      curveSegments: 8
    });
    slabExtrude.rotateX(Math.PI / 2);
    // After rotateX(PI/2), extrude goes from Y = 0 down to Y = -1.6; shift so top bevel aligns cleanly at Y = 0
    slabExtrude.translate(0, -0.35, 0);

    const topMesh = new THREE.Mesh(slabExtrude, makeMat(pal.GRASS_DRY));
    topMesh.receiveShadow = true;
    islandGroup.add(topMesh);

    // Multi-toned dry autumn grass patches on top surface
    const grassPatches = [
      { x: -34, z: -22, w: 26, d: 22, c: pal.GRASS_OLIVE },
      { x: -36, z: 16, w: 24, d: 20, c: pal.GRASS_MOSS },
      { x: 18, z: -18, w: 48, d: 34, c: pal.GRASS_OLIVE },
      { x: 26, z: 16, w: 38, d: 28, c: pal.GRASS_MOSS },
      { x: -2, z: -20, w: 28, d: 24, c: pal.GRASS_MOSS },
      { x: 34, z: -6, w: 26, d: 22, c: pal.GRASS_DRY },
      { x: -16, z: 26, w: 28, d: 14, c: pal.GRASS_OLIVE },
      { x: 14, z: 27, w: 32, d: 14, c: pal.GRASS_OLIVE }
    ];

    grassPatches.forEach((gp, idx) => {
      const pShape = createRoundedRectShape(gp.w, gp.d, 4);
      const pGeo = new THREE.ShapeGeometry(pShape, 5);
      pGeo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(pGeo, makeMat(gp.c));
      m.position.set(gp.x, 0.012 + idx * 0.002, gp.z);
      m.receiveShadow = true;
      islandGroup.add(m);
    });

    // Cobblestone plazas & dirt/cobble midway footpaths
    buildPathways(islandGroup, pal);

    // Dramatic faceted plum-rock cliff rim tapering down to Y = -22
    buildCliffStrata(islandGroup, pal);

    // Ember Mine Run Rock Hill around X = 25, Z = -17.5
    buildEmberMineRockHill(islandGroup, pal);

    root.add(islandGroup);
  }

  function buildPathways(parent, pal) {
    const pathGroup = new THREE.Group();
    pathGroup.name = 'MidwayPaths';

    const dirtMat = makeMat(pal.DIRT_PATH);
    const cobbleMat = makeMat(pal.COBBLESTONE);
    const curbMat = makeMat(pal.PLUM_ROCK_LIGHT);

    // Primary walkway rectangles
    const roadSegments = [
      // Entrance plaza & southern promenade
      { x: -38, z: 26, w: 12, d: 10, y: 0.025, mat: cobbleMat },
      { x: -19, z: 24.5, w: 34, d: 5.5, y: 0.025, mat: dirtMat },
      // Station front plaza & queue apron
      { x: -3.5, z: 21.5, w: 17, d: 12.5, y: 0.022, mat: cobbleMat },
      // Main North-South midway boulevard
      { x: -25.0, z: 1.0, w: 6.5, d: 50.0, y: 0.025, mat: dirtMat },
      // Central Cafe & Fountain Cobblestone Plaza
      { x: -31.0, z: 8.0, w: 18.0, d: 14.0, y: 0.028, mat: cobbleMat },
      // Ferris Wheel & Carousel North-West Plaza
      { x: -31.5, z: -18.0, w: 20.0, d: 16.0, y: 0.024, mat: cobbleMat },
      // East-West connector to viewing fence
      { x: -18.0, z: 8.0, w: 10.0, d: 4.5, y: 0.026, mat: dirtMat },
      { x: -15.0, z: 2.0, w: 4.0, d: 26.0, y: 0.023, mat: dirtMat }
    ];

    roadSegments.forEach((seg) => {
      const geo = new THREE.BoxGeometry(seg.w, 0.06, seg.d);
      const mesh = new THREE.Mesh(geo, seg.mat);
      mesh.position.set(seg.x, seg.y, seg.z);
      mesh.receiveShadow = true;
      pathGroup.add(mesh);
    });

    // Decorative cobblestone stepping tiles along the main midway
    const tileGeo = new THREE.BoxGeometry(1.1, 0.075, 0.85);
    for (let i = 0; i < 65; i++) {
      const z = -22 + i * 0.75;
      const x = -25.0 + (i % 2 === 0 ? -1.4 : 1.4) + (rand() - 0.5) * 0.8;
      const tile = new THREE.Mesh(tileGeo, i % 3 === 0 ? curbMat : cobbleMat);
      tile.position.set(x, 0.032, z);
      tile.rotation.y = (rand() - 0.5) * 0.25;
      tile.receiveShadow = true;
      pathGroup.add(tile);
    }

    parent.add(pathGroup);
  }

  function buildCliffStrata(parent, pal) {
    const cliffGroup = new THREE.Group();
    cliffGroup.name = 'CliffRim';

    const rockColors = [pal.PLUM_ROCK_LIGHT, pal.PLUM_ROCK, pal.PLUM_ROCK_DARK];

    // Layered faceted rings tapering from Y = -1.2 down to Y = -22
    const levels = [
      { y: -1.1, rx: 53.5, rz: 37.5, jag: 1.2 },
      { y: -4.2, rx: 51.5, rz: 35.8, jag: 2.2 },
      { y: -8.5, rx: 46.0, rz: 31.5, jag: 2.8 },
      { y: -13.2, rx: 36.5, rz: 24.5, jag: 3.1 },
      { y: -17.8, rx: 22.0, rz: 14.5, jag: 2.4 },
      { y: -22.0, rx: 4.5, rz: 3.0, jag: 0.8 }
    ];

    const segs = 40;
    const rings = [];

    for (let li = 0; li < levels.length; li++) {
      const lv = levels[li];
      const ring = [];
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        // Superellipse / rounded rectangle contour matching top slab
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const exp = 0.78;
        const sx = Math.sign(ca) * Math.pow(Math.abs(ca), exp) * lv.rx;
        const sz = Math.sign(sa) * Math.pow(Math.abs(sa), exp) * lv.rz;
        const n = (li === 0) ? 0 : (rand() - 0.5) * lv.jag;
        const ny = (li === 0 || li === levels.length - 1) ? 0 : (rand() - 0.5) * 0.9;
        ring.push(new THREE.Vector3(sx + ca * n, lv.y + ny, sz + sa * n));
      }
      rings.push(ring);
    }

    // Build faceted strata bands so each level can have slightly varied plum-rock tones
    for (let li = 0; li < levels.length - 1; li++) {
      const positions = [];
      const topR = rings[li];
      const botR = rings[li + 1];

      for (let s = 0; s < segs; s++) {
        const sn = (s + 1) % segs;
        const p00 = topR[s];
        const p10 = topR[sn];
        const p01 = botR[s];
        const p11 = botR[sn];

        // Triangle 1
        positions.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z);
        // Triangle 2
        positions.push(p10.x, p10.y, p10.z, p01.x, p01.y, p01.z, p11.x, p11.y, p11.z);
      }

      // Close bottom cap on last level
      if (li === levels.length - 2) {
        const center = new THREE.Vector3(0, -22.4, 0);
        for (let s = 0; s < segs; s++) {
          const sn = (s + 1) % segs;
          positions.push(botR[sn].x, botR[sn].y, botR[sn].z, botR[s].x, botR[s].y, botR[s].z, center.x, center.y, center.z);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      const mat = makeMat(rockColors[Math.min(2, Math.floor((li / (levels.length - 1)) * 3))]);
      const bandMesh = new THREE.Mesh(geo, mat);
      bandMesh.receiveShadow = true;
      cliffGroup.add(bandMesh);
    }

    // Add jutting cliff outcroppings, under-ledges & hanging autumn vines/roots around the rim
    const cragGeo = new THREE.DodecahedronGeometry(2.6, 0);
    const vineMat = makeMat(pal.GRASS_MOSS);
    const rootMat = makeMat(pal.TIMBER_DARK);

    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + randRange(-0.05, 0.05);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.78) * 51.0;
      const rz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.78) * 35.5;

      const crag = new THREE.Mesh(cragGeo, makeMat(rockColors[i % 3]));
      crag.position.set(rx, randRange(-7.5, -2.5), rz);
      crag.scale.set(randRange(0.9, 1.8), randRange(0.7, 1.5), randRange(0.9, 1.7));
      crag.rotation.set(rand() * 2, rand() * 2, rand() * 2);
      cliffGroup.add(crag);

      // Hanging vines / roots on every second crag
      if (i % 2 === 0) {
        const vLen = randRange(3.2, 6.8);
        const vineGeo = new THREE.CylinderGeometry(0.08, 0.22, vLen, 5);
        const vine = new THREE.Mesh(vineGeo, i % 4 === 0 ? vineMat : rootMat);
        vine.position.set(rx * 0.96, -3.5 - vLen * 0.5, rz * 0.96);
        vine.rotation.z = (rand() - 0.5) * 0.25;
        cliffGroup.add(vine);
      }
    }

    // 3 Floating Satellite Rock Islets drifting gently near the island edges
    satelliteIslets = [];
    const isletConfigs = [
      { x: -62, y: -4.5, z: -18, scale: 1.25, hasTree: true },
      { x: 61, y: -6.0, z: 14, scale: 1.05, hasTree: true },
      { x: -46, y: -8.0, z: 44, scale: 0.9, hasTree: false }
    ];

    isletConfigs.forEach((cfg, idx) => {
      const g = new THREE.Group();
      g.position.set(cfg.x, cfg.y, cfg.z);

      const rock = new THREE.Mesh(
        new THREE.ConeGeometry(3.4 * cfg.scale, 6.2 * cfg.scale, 7),
        makeMat(pal.PLUM_ROCK)
      );
      rock.rotation.x = Math.PI;
      rock.position.y = -3.1 * cfg.scale;
      g.add(rock);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(3.5 * cfg.scale, 3.2 * cfg.scale, 0.8 * cfg.scale, 7),
        makeMat(pal.GRASS_DRY)
      );
      cap.position.y = 0.2;
      g.add(cap);

      if (cfg.hasTree) {
        const miniPine = createPineTreeMesh(0.75 * cfg.scale, pal);
        miniPine.position.y = 0.5;
        g.add(miniPine);
      }

      parent.add(g);
      satelliteIslets.push({
        group: g,
        baseY: cfg.y,
        phase: idx * 2.1,
        speed: 0.9 + idx * 0.25
      });
    });

    parent.add(cliffGroup);
  }

  // ---------------------------------------------------------------------------
  // 2B. Ember Mine Run Rock Hill, Tunnel Portals & Ore Cart Prop
  // ---------------------------------------------------------------------------
  function buildEmberMineRockHill(parent, pal) {
    const hillGroup = new THREE.Group();
    hillGroup.name = 'EmberMineRockHill';

    // Stepped faceted mountain strata matching CPE.WORLD.getRockHillHeight(x, z)
    // Centered around (24.5, -17.5), radius 13m, peak Y = 9.5
    const radialSegs = 24;
    const rings = 8;
    const positions = [];

    function sampleHill(rFrac, angle) {
      const r = rFrac * HILL_RADIUS;
      const x = HILL_CENTER_X + Math.cos(angle) * r;
      const z = HILL_CENTER_Z + Math.sin(angle) * r;
      let y = CPE.WORLD.getRockHillHeight(x, z);
      if (rFrac > 0.05 && rFrac < 0.95) {
        y += Math.sin(angle * 5 + rFrac * 6) * 0.45;
      }
      if (rFrac >= 0.98) y = -0.05;
      return new THREE.Vector3(x, y, z);
    }

    for (let ri = 0; ri < rings; ri++) {
      const r0 = ri / rings;
      const r1 = (ri + 1) / rings;
      for (let si = 0; si < radialSegs; si++) {
        const a0 = (si / radialSegs) * Math.PI * 2;
        const a1 = ((si + 1) / radialSegs) * Math.PI * 2;

        const p00 = sampleHill(r0, a0);
        const p10 = sampleHill(r0, a1);
        const p01 = sampleHill(r1, a0);
        const p11 = sampleHill(r1, a1);

        if (ri > 0) {
          positions.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z);
        }
        positions.push(p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z);
      }
    }

    const hillGeo = new THREE.BufferGeometry();
    hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hillGeo.computeVertexNormals();

    const hillMesh = new THREE.Mesh(hillGeo, makeMat(pal.PLUM_ROCK));
    hillMesh.castShadow = true;
    hillMesh.receiveShadow = true;
    hillGroup.add(hillMesh);

    // Secondary faceted rocky boulders & strata ledges around the mountain
    const boulderSpecs = [
      { x: 21.0, y: 5.5, z: -15.5, sx: 4.2, sy: 3.4, sz: 3.8, c: pal.PLUM_ROCK_LIGHT },
      { x: 28.0, y: 5.2, z: -19.5, sx: 4.5, sy: 3.6, sz: 4.0, c: pal.PLUM_ROCK_DARK },
      { x: 24.5, y: 7.8, z: -17.5, sx: 4.8, sy: 2.6, sz: 4.4, c: pal.PLUM_ROCK_LIGHT },
      { x: 17.5, y: 2.6, z: -21.0, sx: 3.6, sy: 2.8, sz: 3.2, c: pal.PLUM_ROCK },
      { x: 31.0, y: 2.8, z: -14.0, sx: 3.8, sy: 2.9, sz: 3.5, c: pal.PLUM_ROCK_LIGHT },
      { x: 25.0, y: 9.2, z: -17.2, sx: 3.2, sy: 0.7, sz: 3.0, c: pal.GRASS_MOSS }
    ];
    const bGeo = new THREE.DodecahedronGeometry(1.0, 0);
    boulderSpecs.forEach((b) => {
      const m = new THREE.Mesh(bGeo, makeMat(b.c));
      m.position.set(b.x, b.y, b.z);
      m.scale.set(b.sx, b.sy, b.sz);
      m.rotation.set(rand() * 1.5, rand() * 3.0, rand() * 1.5);
      m.castShadow = true;
      m.receiveShadow = true;
      hillGroup.add(m);
    });

    // Portal Group (populated from coaster #2 tunnelRanges or fallback coordinates)
    minePortalGroup = new THREE.Group();
    minePortalGroup.name = 'MineTunnelPortals';
    hillGroup.add(minePortalGroup);

    // Try building portals right away; if CPE.COASTERS[2] isn't ready yet, build fallback and upgrade in update()
    buildOrUpdateMinePortals(pal);

    // Scenic Ore Cart Prop on rustic rails outside the western mine slope
    const cartGroup = buildOreCartProp(pal);
    cartGroup.position.set(13.2, 0.05, -13.5);
    cartGroup.rotation.y = 0.55;
    hillGroup.add(cartGroup);

    parent.add(hillGroup);
  }

  function createMinePortalArch(pal) {
    const arch = new THREE.Group();
    const timberMat = makeMat(pal.TIMBER_DARK);
    const beamMat = makeMat(pal.TIMBER_MID);
    const voidMat = makeMat(0x120916);
    const glowMat = makeGlowMat(pal.WARM_GLOW, 0.45, 1.15);

    // Left & right heavy timber posts
    const postGeo = new THREE.BoxGeometry(0.65, 4.4, 0.65);
    const leftPost = new THREE.Mesh(postGeo, timberMat);
    leftPost.position.set(-2.1, 1.8, 0);
    arch.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, timberMat);
    rightPost.position.set(2.1, 1.8, 0);
    arch.add(rightPost);

    // Top crossbeam & knee braces
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.7, 0.85), beamMat);
    lintel.position.set(0, 4.1, 0);
    arch.add(lintel);

    const braceGeo = new THREE.BoxGeometry(0.45, 1.4, 0.5);
    const braceL = new THREE.Mesh(braceGeo, beamMat);
    braceL.position.set(-1.45, 3.35, 0);
    braceL.rotation.z = -0.65;
    arch.add(braceL);

    const braceR = new THREE.Mesh(braceGeo, beamMat);
    braceR.position.set(1.45, 3.35, 0);
    braceR.rotation.z = 0.65;
    arch.add(braceR);

    // Dark recessed mine bore backdrop
    const bore = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.9, 1.2), voidMat);
    bore.position.set(0, 1.85, -0.35);
    arch.add(bore);

    // Hanging warm mine lanterns on left & right posts
    [-1.65, 1.65].forEach((lx) => {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.32), glowMat);
      lantern.position.set(lx, 3.1, 0.38);
      arch.add(lantern);
    });

    return arch;
  }

  function buildOrUpdateMinePortals(pal) {
    if (!minePortalGroup) return;
    while (minePortalGroup.children.length > 0) {
      minePortalGroup.remove(minePortalGroup.children[0]);
    }

    const mineCoaster = CPE.COASTERS && CPE.COASTERS[2];
    const glowMat = makeGlowMat(pal.WARM_GLOW, 0.5, 1.2);
    const ribMat = makeMat(pal.TIMBER_DARK);

    if (mineCoaster && mineCoaster.tunnelRanges && mineCoaster.tunnelRanges.length > 0 && mineCoaster.sampleAt) {
      mineCoaster.tunnelRanges.forEach((range) => {
        const sEntry = mineCoaster.sampleAt(range.sStart);
        const sExit = mineCoaster.sampleAt(range.sEnd);

        // Entry Portal
        const pEntry = createMinePortalArch(pal);
        pEntry.position.copy(sEntry.pos);
        pEntry.position.y -= 0.4;
        const lookEntry = sEntry.pos.clone().sub(sEntry.tangent);
        lookEntry.y = pEntry.position.y;
        pEntry.lookAt(lookEntry);
        minePortalGroup.add(pEntry);

        // Exit Portal
        const pExit = createMinePortalArch(pal);
        pExit.position.copy(sExit.pos);
        pExit.position.y -= 0.4;
        const lookExit = sExit.pos.clone().add(sExit.tangent);
        lookExit.y = pExit.position.y;
        pExit.lookAt(lookExit);
        minePortalGroup.add(pExit);

        // Interior tunnel timber ribs & glowing lanterns along the tunnel bore
        const steps = 6;
        for (let i = 1; i < steps; i++) {
          const sMid = range.sStart + ((range.sEnd - range.sStart) * i) / steps;
          const samp = mineCoaster.sampleAt(sMid);
          const ribGroup = new THREE.Group();
          ribGroup.position.copy(samp.pos);
          const lookTarget = samp.pos.clone().add(samp.tangent);
          lookTarget.y = samp.pos.y;
          ribGroup.lookAt(lookTarget);

          const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), glowMat);
          lantern.position.set(i % 2 === 0 ? -1.5 : 1.5, 2.1, 0);
          ribGroup.add(lantern);

          const capBeam = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 0.35), ribMat);
          capBeam.position.set(0, 2.7, 0);
          ribGroup.add(capBeam);

          minePortalGroup.add(ribGroup);
        }
      });
      minePortalsBuilt = true;
    } else {
      // Fallback portal placement at edges of the rock hill along the tunnel path
      const entryFallback = createMinePortalArch(pal);
      entryFallback.position.set(14.5, 1.2, -16.5);
      entryFallback.rotation.y = -Math.PI * 0.45;
      minePortalGroup.add(entryFallback);

      const exitFallback = createMinePortalArch(pal);
      exitFallback.position.set(34.5, 1.2, -18.5);
      exitFallback.rotation.y = Math.PI * 0.52;
      minePortalGroup.add(exitFallback);
    }
  }

  function buildOreCartProp(pal) {
    const g = new THREE.Group();
    const sleeperMat = makeMat(pal.TIMBER_DARK);
    const railMat = makeMat(pal.STEEL_DARK);
    const bodyMat = makeMat(pal.STEEL_TEAL);
    const emberMat = makeGlowMat(pal.FOLIAGE_ORANGE, 0.35, 1.0);

    // Short mine track segment
    for (let i = 0; i < 6; i++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.22), sleeperMat);
      sl.position.set(0, 0.06, -1.2 + i * 0.48);
      g.add(sl);
    }
    [-0.42, 0.42].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 2.8), railMat);
      rail.position.set(rx, 0.16, 0);
      g.add(rail);
    });

    // Cart body
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.75, 1.45), bodyMat);
    tub.position.set(0, 0.68, 0);
    tub.castShadow = true;
    g.add(tub);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    [
      [-0.52, 0.25, -0.45],
      [0.52, 0.25, -0.45],
      [-0.52, 0.25, 0.45],
      [0.52, 0.25, 0.45]
    ].forEach((wp) => {
      const w = new THREE.Mesh(wheelGeo, railMat);
      w.position.set(wp[0], wp[1], wp[2]);
      g.add(w);
    });

    // Glowing coal / ember nuggets heaped inside
    const nuggetGeo = new THREE.DodecahedronGeometry(0.24, 0);
    for (let i = 0; i < 7; i++) {
      const n = new THREE.Mesh(nuggetGeo, i % 2 === 0 ? emberMat : makeMat(pal.PLUM_ROCK_DARK));
      n.position.set((rand() - 0.5) * 0.6, 1.08 + (i % 2) * 0.12, (rand() - 0.5) * 0.9);
      g.add(n);
    }

    return g;
  }

  // ---------------------------------------------------------------------------
  // 3. Entrance Gate ("CINDERPINE" 3D Pixel Marquee) & Switchback Queue
  // ---------------------------------------------------------------------------
  const PIXEL_FONT = {
    C: ['0111', '1000', '1000', '1000', '0111'],
    I: ['111', '010', '010', '010', '111'],
    N: ['1001', '1101', '1011', '1001', '1001'],
    D: ['1110', '1001', '1001', '1001', '1110'],
    E: ['1111', '1000', '1110', '1000', '1111'],
    R: ['1110', '1001', '1110', '1010', '1001'],
    P: ['1110', '1001', '1110', '1000', '1000']
  };

  function buildPixelWord(text, pixelSize, depth, mat) {
    const wordGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(pixelSize, pixelSize, depth);
    let cursorX = 0;

    for (let ci = 0; ci < text.length; ci++) {
      const ch = text[ci];
      const rows = PIXEL_FONT[ch];
      if (!rows) {
        cursorX += pixelSize * 3;
        continue;
      }
      const cols = rows[0].length;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < cols; c++) {
          if (rows[r][c] === '1') {
            const px = new THREE.Mesh(boxGeo, mat);
            px.position.set(cursorX + c * pixelSize, (4 - r) * pixelSize, 0);
            wordGroup.add(px);
          }
        }
      }
      cursorX += (cols + 1) * pixelSize;
    }

    // Center horizontally
    const totalW = cursorX - pixelSize;
    wordGroup.children.forEach((child) => {
      child.position.x -= totalW * 0.5;
    });

    return wordGroup;
  }

  function buildEntranceGateAndQueue(root) {
    const pal = P();
    const gateGroup = new THREE.Group();
    gateGroup.name = 'EntranceGate';
    gateGroup.position.set(-38, 0, 28);

    const brickMat = makeMat(pal.BRICK_RED);
    const brickDarkMat = makeMat(pal.BRICK_DARK);
    const stoneMat = makeMat(pal.CREAM);
    const ironMat = makeMat(pal.STEEL_DARK);
    const brassMat = makeMat(pal.BRASS);
    const bulbMat = makeGlowMat(pal.WARM_GLOW, 0.35, 1.15);

    // Two grand brick pillars
    [-4.4, 4.4].forEach((px) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.7), brickDarkMat);
      base.position.set(px, 0.45, 0);
      base.castShadow = true;
      gateGroup.add(base);

      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.6, 1.4), brickMat);
      shaft.position.set(px, 2.75, 0);
      shaft.castShadow = true;
      gateGroup.add(shaft);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 1.8), stoneMat);
      cap.position.set(px, 5.2, 0);
      gateGroup.add(cap);

      // Pillar lantern
      const lanternStand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 6), ironMat);
      lanternStand.position.set(px, 5.6, 0);
      gateGroup.add(lanternStand);

      const lanternGlobe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.55), bulbMat);
      lanternGlobe.position.set(px, 6.1, 0);
      gateGroup.add(lanternGlobe);

      const lanternRoof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 4), ironMat);
      lanternRoof.position.set(px, 6.62, 0);
      lanternRoof.rotation.y = Math.PI / 4;
      gateGroup.add(lanternRoof);
    });

    // Wrought-iron arch & marquee board
    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.35, 0.5), ironMat);
    archBeam.position.set(0, 5.05, 0);
    gateGroup.add(archBeam);

    const marqueeBacking = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.65, 0.45), brickDarkMat);
    marqueeBacking.position.set(0, 6.0, 0);
    marqueeBacking.castShadow = true;
    gateGroup.add(marqueeBacking);

    const marqueeFrame = new THREE.Mesh(new THREE.BoxGeometry(8.45, 1.85, 0.35), brassMat);
    marqueeFrame.position.set(0, 6.0, 0);
    gateGroup.add(marqueeFrame);

    // 3D Pixel-Block Sign reading "CINDERPINE" on both front (+Z) and back (-Z)
    const letterMat = makeGlowMat(pal.CREAM, 0.3, 1.0);
    const wordFront = buildPixelWord('CINDERPINE', 0.16, 0.16, letterMat);
    wordFront.position.set(0, 5.68, 0.24);
    gateGroup.add(wordFront);

    const wordBack = buildPixelWord('CINDERPINE', 0.16, 0.16, letterMat);
    wordBack.position.set(0, 5.68, -0.24);
    wordBack.rotation.y = Math.PI;
    gateGroup.add(wordBack);

    // Glowing marquee bulbs along top & bottom edges
    marqueeBulbs = [];
    const bulbGeo = new THREE.BoxGeometry(0.14, 0.14, 0.56);
    for (let i = 0; i < 19; i++) {
      const bx = -3.9 + i * 0.433;
      const bTop = new THREE.Mesh(bulbGeo, bulbMat);
      bTop.position.set(bx, 6.82, 0);
      gateGroup.add(bTop);

      const bBot = new THREE.Mesh(bulbGeo, bulbMat);
      bBot.position.set(bx, 5.18, 0);
      gateGroup.add(bBot);
      marqueeBulbs.push(bTop, bBot);
    }

    // Decorative iron side fences flanking the entrance gate
    [-7.2, 7.2].forEach((fx) => {
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.12), ironMat);
      railTop.position.set(fx, 1.35, 0);
      gateGroup.add(railTop);
      for (let p = -4; p <= 4; p++) {
        const picket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.08), ironMat);
        picket.position.set(fx + p * 0.45, 0.72, 0);
        gateGroup.add(picket);
      }
    });

    root.add(gateGroup);

    // Switchback Queue (X in [-11, 2], Z in [17, 27]) leading to Coaster Station stairs (X in [-6, 4], Z = 16.5)
    buildSwitchbackQueue(root, pal);
  }

  function buildSwitchbackQueue(root, pal) {
    const qGroup = new THREE.Group();
    qGroup.name = 'SwitchbackQueue';

    const postMat = makeMat(pal.TIMBER_DARK);
    const capMat = makeMat(pal.BRASS);
    const ropeMat = makeMat(pal.CHERRY_RED);

    const postGeo = new THREE.CylinderGeometry(0.09, 0.1, 1.05, 6);
    const ballGeo = new THREE.DodecahedronGeometry(0.13, 0);

    // Stanchion rows along Z = 26.5, 24.1, 21.7, 19.3, 17.2 across X in [-10.5, 1.5]
    const zRows = [26.5, 24.1, 21.7, 19.3, 17.2];
    const xCols = [-10.5, -7.5, -4.5, -1.5, 1.5];

    zRows.forEach((z) => {
      xCols.forEach((x) => {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 0.52, z);
        post.castShadow = true;
        qGroup.add(post);

        const cap = new THREE.Mesh(ballGeo, capMat);
        cap.position.set(x, 1.08, z);
        qGroup.add(cap);
      });
    });

    // Horizontal switchback ropes creating a snaking path
    function addRope(x1, z1, x2, z2) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const rGeo = new THREE.CylinderGeometry(0.04, 0.04, len, 5);
      rGeo.rotateZ(Math.PI / 2);
      const rope = new THREE.Mesh(rGeo, ropeMat);
      rope.position.set((x1 + x2) * 0.5, 0.82, (z1 + z2) * 0.5);
      rope.rotation.y = -Math.atan2(dz, dx);
      qGroup.add(rope);
    }

    // Outer boundary & inner divider ropes so guests snake cleanly:
    // Entry at (-10.5, 25.3) -> east to (1.5, 25.3) -> turn north to (1.5, 22.9) -> west to (-10.5, 22.9) ->
    // turn north to (-10.5, 20.5) -> east to (1.5, 20.5) -> turn north to (-1.5, 18.2) -> station stairs at (-1.5, 16.5)
    addRope(-7.5, 26.5, 1.5, 26.5);
    addRope(-10.5, 24.1, -1.5, 24.1);
    addRope(-7.5, 21.7, 1.5, 21.7);
    addRope(-10.5, 19.3, -1.5, 19.3);
    addRope(-10.5, 17.2, -4.5, 17.2);
    addRope(-1.5, 17.2, 1.5, 17.2);

    // End-turn ropes
    addRope(1.5, 26.5, 1.5, 21.7);
    addRope(-10.5, 24.1, -10.5, 17.2);
    addRope(1.5, 21.7, 1.5, 17.2);

    // Queue Entrance Arch & Directional Sign at (-10.5, 0, 26.0)
    const signPostL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.8, 0.22), postMat);
    signPostL.position.set(-10.8, 1.4, 26.5);
    qGroup.add(signPostL);

    const signPostR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.8, 0.22), postMat);
    signPostR.position.set(-10.8, 1.4, 24.1);
    qGroup.add(signPostR);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 2.8), makeMat(pal.CHERRY_RED));
    signBoard.position.set(-10.8, 2.55, 25.3);
    qGroup.add(signBoard);

    const signTrim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 2.5), makeGlowMat(pal.CREAM, 0.2, 0.85));
    signTrim.position.set(-10.8, 2.55, 25.3);
    qGroup.add(signTrim);

    root.add(qGroup);
  }

  // ---------------------------------------------------------------------------
  // 4. Midway Attractions & Buildings
  // ---------------------------------------------------------------------------
  function buildFairgroundStalls(root) {
    const pal = P();
    const stallsGroup = new THREE.Group();
    stallsGroup.name = 'FairgroundStalls';

    const stallConfigs = [
      {
        name: 'TicketBooth',
        x: -30,
        z: 26,
        rotY: 0,
        stripeA: pal.CHERRY_RED,
        stripeB: pal.CREAM,
        bodyColor: pal.TIMBER_MID,
        type: 'tickets'
      },
      {
        name: 'PopcornChestnuts',
        x: -19,
        z: 10,
        rotY: -Math.PI / 2,
        stripeA: pal.CHERRY_RED,
        stripeB: pal.CREAM,
        bodyColor: pal.TIMBER_LIGHT,
        type: 'popcorn'
      },
      {
        name: 'CiderHotCocoa',
        x: -19,
        z: 2,
        rotY: -Math.PI / 2,
        stripeA: pal.GOLD,
        stripeB: pal.PLUM_ROCK,
        bodyColor: pal.TIMBER_MID,
        type: 'cider'
      },
      {
        name: 'RingTossGame',
        x: -19,
        z: -6,
        rotY: -Math.PI / 2,
        stripeA: pal.STEEL_TEAL,
        stripeB: pal.CREAM,
        bodyColor: pal.TIMBER_DARK,
        type: 'ringtoss'
      },
      {
        name: 'CandyApplePretzel',
        x: -19,
        z: -14,
        rotY: -Math.PI / 2,
        stripeA: pal.CHERRY_RED,
        stripeB: pal.GOLD,
        bodyColor: pal.TIMBER_LIGHT,
        type: 'candy'
      },
      {
        name: 'BalloonSouvenir',
        x: -30,
        z: -20,
        rotY: 0,
        stripeA: pal.STEEL_TEAL,
        stripeB: pal.GOLD,
        bodyColor: pal.TIMBER_MID,
        type: 'balloon'
      }
    ];

    stallConfigs.forEach((cfg) => {
      const stall = new THREE.Group();
      stall.name = cfg.name;
      stall.position.set(cfg.x, 0, cfg.z);
      stall.rotation.y = cfg.rotY;

      const w = 3.4;
      const d = 2.6;
      const bodyMat = makeMat(cfg.bodyColor);
      const trimMat = makeMat(pal.TIMBER_DARK);
      const counterMat = makeMat(pal.CREAM);
      const interiorGlow = makeGlowMat(pal.WARM_GLOW, 0.25, 1.05);

      // Lower wooden counter base
      const lowerBox = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, d), bodyMat);
      lowerBox.position.set(0, 0.58, 0);
      lowerBox.castShadow = true;
      lowerBox.receiveShadow = true;
      stall.add(lowerBox);

      // Front serving counter ledge
      const counterTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.14, 0.65), counterMat);
      counterTop.position.set(0, 1.18, d * 0.5 + 0.1);
      stall.add(counterTop);

      // Back wall & glowing interior backdrop
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 1.55, 0.25), trimMat);
      backWall.position.set(0, 1.9, -d * 0.42);
      stall.add(backWall);

      const glowPanel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 1.25, 0.3), interiorGlow);
      glowPanel.position.set(0, 1.85, -d * 0.28);
      stall.add(glowPanel);

      // Corner posts supporting awning
      [
        [-w * 0.46, d * 0.46],
        [w * 0.46, d * 0.46],
        [-w * 0.46, -d * 0.46],
        [w * 0.46, -d * 0.46]
      ].forEach((cp) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), trimMat);
        post.position.set(cp[0], 1.9, cp[1]);
        stall.add(post);
      });

      // Striped Autumn Canvas Awning (7 alternating stripes)
      const stripeCount = 7;
      const stripeW = (w + 0.5) / stripeCount;
      const matA = makeMat(cfg.stripeA);
      const matB = makeMat(cfg.stripeB);

      for (let s = 0; s < stripeCount; s++) {
        const sx = -((w + 0.5) * 0.5) + (s + 0.5) * stripeW;
        const sMat = s % 2 === 0 ? matA : matB;

        const roofSlope = new THREE.Mesh(new THREE.BoxGeometry(stripeW + 0.02, 0.16, d + 0.8), sMat);
        roofSlope.position.set(sx, 2.85, 0.12);
        roofSlope.rotation.x = 0.22;
        roofSlope.castShadow = true;
        stall.add(roofSlope);

        // Valance flap along the front
        const valance = new THREE.Mesh(new THREE.BoxGeometry(stripeW * 0.92, 0.28, 0.08), sMat);
        valance.position.set(sx, 2.52, d * 0.5 + 0.48);
        stall.add(valance);
      }

      // Stall-specific props
      if (cfg.type === 'popcorn') {
        const popper = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.6), interiorGlow);
        popper.position.set(-0.6, 1.65, 0.2);
        stall.add(popper);
        const roaster = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), makeMat(pal.STEEL_DARK));
        roaster.position.set(0.65, 1.48, 0.35);
        stall.add(roaster);
      } else if (cfg.type === 'cider') {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.72, 8), makeMat(pal.TIMBER_DARK));
        barrel.position.set(-0.7, 1.55, 0.3);
        stall.add(barrel);
        const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 8), makeMat(pal.BRASS));
        urn.position.set(0.55, 1.55, 0.35);
        stall.add(urn);
      } else if (cfg.type === 'ringtoss') {
        const pinMat = makeMat(pal.GOLD);
        for (let p = -2; p <= 2; p++) {
          const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.38, 6), pinMat);
          pin.position.set(p * 0.35, 1.42, 0.1);
          stall.add(pin);
        }
      } else if (cfg.type === 'candy') {
        const appleMat = makeMat(pal.CHERRY_RED);
        for (let a = -2; a <= 2; a++) {
          const apple = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), appleMat);
          apple.position.set(a * 0.36, 1.4, 0.45);
          stall.add(apple);
        }
      } else if (cfg.type === 'balloon') {
        // Bouquet of floating balloons above the stall
        const bColors = [pal.CHERRY_RED, pal.GOLD, pal.STEEL_TEAL, pal.FOLIAGE_ORANGE];
        for (let b = 0; b < 6; b++) {
          const ang = (b / 6) * Math.PI * 2;
          const bal = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.34, 1),
            makeMat(bColors[b % bColors.length])
          );
          bal.position.set(1.6 + Math.cos(ang) * 0.38, 3.8 + (b % 3) * 0.38, 1.1 + Math.sin(ang) * 0.38);
          stall.add(bal);
        }
      }

      stallsGroup.add(stall);
    });

    root.add(stallsGroup);
  }

  // ---------------------------------------------------------------------------
  // 4B. Autumn Cafe ("The Cinder Hearth Cafe") & Patio (X = -38, Z = 8)
  // ---------------------------------------------------------------------------
  function buildAutumnCafe(root) {
    const pal = P();
    const cafeGroup = new THREE.Group();
    cafeGroup.name = 'CinderHearthCafe';
    cafeGroup.position.set(-38, 0, 8);

    const brickMat = makeMat(pal.BRICK_RED);
    const timberMat = makeMat(pal.TIMBER_DARK);
    const plasterMat = makeMat(pal.CREAM);
    const roofMat = makeMat(pal.SLATE_ROOF);
    const windowGlowMat = makeGlowMat(pal.WARM_GLOW, 0.25, 1.1);

    // Ground Floor (Brick & Timber, 9.5m wide x 4.0m high x 7.5m deep)
    const groundFloor = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.8, 7.2), brickMat);
    groundFloor.position.set(0, 1.9, 0);
    groundFloor.castShadow = true;
    groundFloor.receiveShadow = true;
    cafeGroup.add(groundFloor);

    // Second Floor (Tudor plaster & timber framing, slightly overhanging)
    const upperFloor = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.2, 7.6), plasterMat);
    upperFloor.position.set(0, 5.4, 0);
    upperFloor.castShadow = true;
    cafeGroup.add(upperFloor);

    // Timber beams framing the second story
    [-3.6, 0, 3.6].forEach((zv) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(9.75, 0.22, 0.25), timberMat);
      beam.position.set(0, 3.8, zv);
      cafeGroup.add(beam);
    });

    // Pitched Slate Roof (extruded gable prism facing East toward the plaza)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-4.3, 0);
    roofShape.lineTo(0, 3.4);
    roofShape.lineTo(4.3, 0);
    roofShape.closePath();

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 10.4, bevelEnabled: false });
    roofGeo.translate(0, 0, -5.2);
    roofGeo.rotateY(Math.PI / 2);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(0, 6.95, 0);
    roofMesh.castShadow = true;
    cafeGroup.add(roofMesh);

    // Brick Chimney on North-West side + rising smoke puffs
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.6, 1.3), makeMat(pal.BRICK_DARK));
    chimney.position.set(-2.8, 8.6, -2.1);
    chimney.castShadow = true;
    cafeGroup.add(chimney);

    smokePuffs = [];
    const puffGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const puffMat = makeMat(pal.CREAM, { transparent: true, opacity: 0.65 });
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(puffGeo, puffMat);
      cafeGroup.add(puff);
      smokePuffs.push({
        mesh: puff,
        phase: i / 6,
        baseX: -2.8,
        baseY: 11.0,
        baseZ: -2.1
      });
    }

    // Warm Glowing Paned Windows on East (plaza-facing), South, and North facades
    const winGeo = new THREE.BoxGeometry(0.22, 1.35, 1.15);
    [-2.2, 0, 2.2].forEach((wz) => {
      // East facade ground & upper windows
      const w1 = new THREE.Mesh(winGeo, windowGlowMat);
      w1.position.set(4.62, 2.1, wz);
      cafeGroup.add(w1);

      const w2 = new THREE.Mesh(winGeo, windowGlowMat);
      w2.position.set(4.82, 5.35, wz);
      cafeGroup.add(w2);
    });

    const winSouthGeo = new THREE.BoxGeometry(1.25, 1.35, 0.22);
    [-2.5, 0, 2.5].forEach((wx) => {
      const ws1 = new THREE.Mesh(winSouthGeo, windowGlowMat);
      ws1.position.set(wx, 2.1, 3.62);
      cafeGroup.add(ws1);

      const ws2 = new THREE.Mesh(winSouthGeo, windowGlowMat);
      ws2.position.set(wx, 5.35, 3.82);
      cafeGroup.add(ws2);
    });

    // East Porch Awning overlooking patio tables
    const porchAwning = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 7.0), makeMat(pal.CHERRY_RED));
    porchAwning.position.set(5.6, 3.3, 0);
    porchAwning.rotation.z = -0.22;
    porchAwning.castShadow = true;
    cafeGroup.add(porchAwning);

    // Outdoor Patio Tables with Umbrellas & Chairs (between Cafe X=-38 and Fountain X=-27)
    const patioOffsets = [
      { x: 6.8, z: -3.2, c: pal.CHERRY_RED },
      { x: 6.8, z: 0.0, c: pal.GOLD },
      { x: 6.8, z: 3.2, c: pal.STEEL_TEAL },
      { x: 3.2, z: 5.6, c: pal.FOLIAGE_ORANGE }
    ];

    patioOffsets.forEach((pt) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(pt.x, 0, pt.z);

      const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 8), plasterMat);
      tableTop.position.y = 0.78;
      tableTop.castShadow = true;
      tGroup.add(tableTop);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.35, 6), timberMat);
      pole.position.y = 1.18;
      tGroup.add(pole);

      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.65, 8), makeMat(pt.c));
      umbrella.position.y = 2.42;
      umbrella.castShadow = true;
      tGroup.add(umbrella);

      // 4 chairs around each table
      for (let ch = 0; ch < 4; ch++) {
        const ang = (ch / 4) * Math.PI * 2 + 0.4;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.42), timberMat);
        seat.position.set(Math.cos(ang) * 1.25, 0.23, Math.sin(ang) * 1.25);
        seat.rotation.y = -ang;
        tGroup.add(seat);
      }

      cafeGroup.add(tGroup);
    });

    root.add(cafeGroup);
  }

  // ---------------------------------------------------------------------------
  // 4C. Central Plaza Fountain (X = -27, Z = 8)
  // ---------------------------------------------------------------------------
  function buildPlazaFountain(root) {
    const pal = P();
    const fGroup = new THREE.Group();
    fGroup.name = 'CentralPlazaFountain';
    fGroup.position.set(-27, 0, 8);

    const stoneMat = makeMat(pal.COBBLESTONE);
    const rimMat = makeMat(pal.CREAM);
    const waterMat = makeGlowMat(pal.STEEL_TEAL, 0.2, 0.65);
    const brassMat = makeMat(pal.BRASS);

    // Outer octagonal stone basin
    const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.75, 8), stoneMat);
    outerWall.position.y = 0.38;
    outerWall.castShadow = true;
    outerWall.receiveShadow = true;
    fGroup.add(outerWall);

    const rimCap = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, 0.14, 8), rimMat);
    rimCap.position.y = 0.78;
    fGroup.add(rimCap);

    // Water surface
    const waterPool = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.12, 8), waterMat);
    waterPool.position.y = 0.76;
    fGroup.add(waterPool);

    // Second & third tiers
    const pedestal1 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 1.3, 8), stoneMat);
    pedestal1.position.y = 1.35;
    fGroup.add(pedestal1);

    const middleBasin = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.2, 0.38, 8), rimMat);
    middleBasin.position.y = 2.05;
    middleBasin.castShadow = true;
    fGroup.add(middleBasin);

    const topSpout = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 8), brassMat);
    topSpout.position.y = 2.75;
    fGroup.add(topSpout);

    // 4 Wooden Park Benches around the fountain
    const benchWood = makeMat(pal.TIMBER_MID);
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + Math.PI / 4;
      const bench = new THREE.Group();
      bench.position.set(Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4);
      bench.rotation.y = -a + Math.PI / 2;

      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.55), benchWood);
      seat.position.y = 0.45;
      bench.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.48, 0.1), benchWood);
      back.position.set(0, 0.72, -0.24);
      bench.add(back);

      fGroup.add(bench);
    }

    // Animated Jumping Water Droplets (InstancedMesh)
    const dropCount = 36;
    const dropGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const dropMat = makeGlowMat(pal.CREAM, 0.35, 0.9);
    fountainMesh = new THREE.InstancedMesh(dropGeo, dropMat, dropCount);
    fountainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fGroup.add(fountainMesh);

    fountainDrops = [];
    for (let i = 0; i < dropCount; i++) {
      fountainDrops.push({
        angle: (i / dropCount) * Math.PI * 2,
        phase: (i / dropCount),
        tier: i % 2 // 0 = upper spout arc, 1 = middle basin arc
      });
    }

    root.add(fGroup);
  }

  // ---------------------------------------------------------------------------
  // 4D. Ferris Wheel (X = -38, Z = -14) — 16m Tall Spoked Wheel + 10 Gondolas
  // ---------------------------------------------------------------------------
  function buildFerrisWheel(root) {
    const pal = P();
    const fwRoot = new THREE.Group();
    fwRoot.name = 'FerrisWheel';
    fwRoot.position.set(-38, 0, -14);
    // Angle slightly toward the midway plaza for dramatic skyline silhouette
    fwRoot.rotation.y = 0.35;

    const steelMat = makeMat(pal.STEEL_TEAL);
    const darkMat = makeMat(pal.STEEL_DARK);
    const woodMat = makeMat(pal.TIMBER_MID);
    const rimGlowMat = makeGlowMat(pal.WARM_GLOW, 0.25, 1.15);

    // Boarding platform deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.9, 4.4), woodMat);
    deck.position.set(0, 0.45, 0);
    deck.receiveShadow = true;
    fwRoot.add(deck);

    // A-Frame Support Legs on front (+Z) and back (-Z)
    const hubY = 9.4;
    const legLen = 10.6;
    const legGeo = new THREE.CylinderGeometry(0.22, 0.28, legLen, 6);

    [-1.65, 1.65].forEach((zSide) => {
      [-1, 1].forEach((xSide) => {
        const leg = new THREE.Mesh(legGeo, darkMat);
        leg.position.set(xSide * 2.2, hubY * 0.5, zSide);
        leg.rotation.z = xSide * 0.42;
        leg.castShadow = true;
        fwRoot.add(leg);
      });
    });

    // Central axle crossbar
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 4.0, 8), makeMat(pal.BRASS));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, hubY, 0);
    fwRoot.add(axle);

    // Rotating Wheel Group (16m total height: hub at 9.4m + radius 7.1m = 16.5m tall)
    ferrisWheelGroup = new THREE.Group();
    ferrisWheelGroup.position.set(0, hubY, 0);
    fwRoot.add(ferrisWheelGroup);

    const wheelRadius = 7.0;
    const numSpokes = 10;
    const gondolaColors = [pal.CHERRY_RED, pal.GOLD, pal.STEEL_TEAL, pal.FOLIAGE_ORANGE, pal.PLUM_ROCK_LIGHT];
    ferrisGondolas = [];

    for (let i = 0; i < numSpokes; i++) {
      const a1 = (i / numSpokes) * Math.PI * 2;
      const a2 = ((i + 1) / numSpokes) * Math.PI * 2;
      const midA = (a1 + a2) * 0.5;
      const chordLen = 2 * wheelRadius * Math.sin(Math.PI / numSpokes);

      // Front and back spokes + glowing rim segments
      [-1.05, 1.05].forEach((zRim) => {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, wheelRadius, 5), steelMat);
        spoke.position.set(Math.cos(a1) * wheelRadius * 0.5, Math.sin(a1) * wheelRadius * 0.5, zRim);
        spoke.rotation.z = a1 - Math.PI / 2;
        ferrisWheelGroup.add(spoke);

        const rimBar = new THREE.Mesh(new THREE.BoxGeometry(chordLen, 0.22, 0.22), rimGlowMat);
        rimBar.position.set(Math.cos(midA) * wheelRadius, Math.sin(midA) * wheelRadius, zRim);
        rimBar.rotation.z = midA + Math.PI / 2;
        ferrisWheelGroup.add(rimBar);
      });

      // Swinging Passenger Gondola at radius
      const gx = Math.cos(a1) * wheelRadius;
      const gy = Math.sin(a1) * wheelRadius;

      const gondola = new THREE.Group();
      gondola.position.set(gx, gy, 0);

      // Crossbar hanger
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6), darkMat);
      hanger.rotation.x = Math.PI / 2;
      gondola.add(hanger);

      // Hanger rods down to cabin
      [-0.75, 0.75].forEach((zr) => {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 5), darkMat);
        rod.position.set(0, -0.58, zr);
        gondola.add(rod);
      });

      // Gondola bucket & roof canopy
      const cMat = makeMat(gondolaColors[i % gondolaColors.length]);
      const tub = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.72, 1.45), cMat);
      tub.position.set(0, -1.25, 0);
      tub.castShadow = true;
      gondola.add(tub);

      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.42, 4), makeMat(pal.CREAM));
      canopy.position.set(0, -0.12, 0);
      canopy.rotation.y = Math.PI / 4;
      gondola.add(canopy);

      ferrisWheelGroup.add(gondola);
      ferrisGondolas.push(gondola);
    }

    root.add(fwRoot);
  }

  // ---------------------------------------------------------------------------
  // 4E. Carousel (X = -25, Z = -22) — Octagonal Canopy & 8 Bobbing Mounts
  // ---------------------------------------------------------------------------
  function buildCarousel(root) {
    const pal = P();
    const cRoot = new THREE.Group();
    cRoot.name = 'Carousel';
    cRoot.position.set(-25, 0, -22);

    const baseMat = makeMat(pal.TIMBER_DARK);
    const deckMat = makeMat(pal.TIMBER_LIGHT);
    const brassMat = makeMat(pal.BRASS);
    const glowMat = makeGlowMat(pal.WARM_GLOW, 0.3, 1.15);

    // Base plinth
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.85, 0.45, 8), baseMat);
    plinth.position.y = 0.22;
    plinth.receiveShadow = true;
    cRoot.add(plinth);

    // Rotating Platform Group
    carouselPlatformGroup = new THREE.Group();
    carouselPlatformGroup.position.y = 0.45;
    cRoot.add(carouselPlatformGroup);

    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.35, 0.2, 8), deckMat);
    turntable.position.y = 0.1;
    carouselPlatformGroup.add(turntable);

    // Central Mirrored Organ Column
    const organCol = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 3.6, 8), makeMat(pal.CHERRY_RED));
    organCol.position.y = 1.9;
    carouselPlatformGroup.add(organCol);

    const organGlowBand = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, 1.2, 8), glowMat);
    organGlowBand.position.y = 2.0;
    carouselPlatformGroup.add(organGlowBand);

    // Octagonal Striped Canopy
    const canopyGroup = new THREE.Group();
    canopyGroup.position.y = 3.7;
    carouselPlatformGroup.add(canopyGroup);

    const segs = 8;
    const rOuter = 4.65;
    const rPeak = 2.1;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;

      const wedgeGeo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        0, rPeak, 0,
        Math.cos(a1) * rOuter, 0, Math.sin(a1) * rOuter,
        Math.cos(a0) * rOuter, 0, Math.sin(a0) * rOuter
      ]);
      wedgeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      wedgeGeo.computeVertexNormals();

      const wMat = makeMat(s % 2 === 0 ? pal.CHERRY_RED : pal.CREAM);
      const wedge = new THREE.Mesh(wedgeGeo, wMat);
      wedge.castShadow = true;
      canopyGroup.add(wedge);
    }

    // Glowing cornice ring & gold finial spire
    const cornice = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.55, 0.35, 8), glowMat);
    cornice.position.y = -0.12;
    canopyGroup.add(cornice);

    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.2, 6), makeMat(pal.GOLD));
    finial.position.y = rPeak + 0.55;
    canopyGroup.add(finial);

    // 8 Brass Poles & Bobbing Horses/Mounts
    carouselMounts = [];
    const mountColors = [pal.CREAM, pal.GOLD, pal.TIMBER_LIGHT, pal.CHERRY_RED];

    for (let m = 0; m < 8; m++) {
      const ang = (m / 8) * Math.PI * 2;
      const r = 3.2;
      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.5, 6), brassMat);
      pole.position.set(px, 1.85, pz);
      carouselPlatformGroup.add(pole);

      // Stylized pixel-art horse mount
      const horse = new THREE.Group();
      horse.position.set(px, 1.4, pz);
      horse.rotation.y = -ang; // tangent to rotation direction

      const hMat = makeMat(mountColors[m % mountColors.length]);
      const saddleMat = makeMat(m % 2 === 0 ? pal.STEEL_TEAL : pal.CHERRY_RED);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.95), hMat);
      horse.add(body);

      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), saddleMat);
      saddle.position.set(0, 0.24, 0);
      horse.add(saddle);

      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.3), hMat);
      neck.position.set(0, 0.35, 0.38);
      neck.rotation.x = 0.35;
      horse.add(neck);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.45), hMat);
      head.position.set(0, 0.58, 0.55);
      horse.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.18), makeMat(pal.TIMBER_DARK));
      tail.position.set(0, 0.05, -0.52);
      tail.rotation.x = -0.4;
      horse.add(tail);

      carouselPlatformGroup.add(horse);
      carouselMounts.push({
        group: horse,
        baseY: 1.4,
        phase: (m / 8) * Math.PI * 2 * 2
      });
    }

    root.add(cRoot);
  }

  // ---------------------------------------------------------------------------
  // 5. Stylized Autumn Trees (~48), Lamp Posts (~24), Bunting & Viewing Fence
  // ---------------------------------------------------------------------------
  function createPineTreeMesh(scale, pal) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 1.8 * scale, 6),
      makeMat(pal.TIMBER_DARK)
    );
    trunk.position.y = 0.9 * scale;
    trunk.castShadow = true;
    g.add(trunk);

    const pineMat = makeMat(pal.FOLIAGE_PINE);
    const tiers = [
      { y: 2.3, r: 1.75, h: 2.3 },
      { y: 3.7, r: 1.35, h: 2.0 },
      { y: 4.9, r: 0.92, h: 1.7 }
    ];
    tiers.forEach((t) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r * scale, t.h * scale, 7), pineMat);
      cone.position.y = t.y * scale;
      cone.castShadow = true;
      cone.receiveShadow = true;
      g.add(cone);
    });
    return g;
  }

  function createMapleTreeMesh(scale, foliageHex, pal) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24 * scale, 0.38 * scale, 2.2 * scale, 6),
      makeMat(pal.TIMBER_DARK)
    );
    trunk.position.y = 1.1 * scale;
    trunk.castShadow = true;
    g.add(trunk);

    const leafMat = makeMat(foliageHex);
    const puffs = [
      { x: 0, y: 3.1, z: 0, r: 1.55 },
      { x: 0.85, y: 2.7, z: 0.5, r: 1.1 },
      { x: -0.8, y: 2.8, z: -0.45, r: 1.15 },
      { x: -0.4, y: 3.6, z: 0.65, r: 1.05 },
      { x: 0.55, y: 3.5, z: -0.6, r: 1.0 }
    ];
    puffs.forEach((p) => {
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r * scale, 0), leafMat);
      crown.position.set(p.x * scale, p.y * scale, p.z * scale);
      crown.rotation.set(rand() * 2, rand() * 2, rand() * 2);
      crown.castShadow = true;
      crown.receiveShadow = true;
      g.add(crown);
    });
    return g;
  }

  function buildTreesLampPostsAndBunting(root) {
    const pal = P();
    const envGroup = new THREE.Group();
    envGroup.name = 'TreesLampsBunting';

    // ~48 Stylized Autumn Trees placed around island perimeter, midway plazas, & safe coaster corners
    const treePositions = [
      // West cliff rim
      [-49, -28], [-49, -20], [-49, -10], [-49, -2], [-49, 6], [-49, 15], [-49, 23], [-47, 31],
      // North-West & North cliff rim
      [-43, -33], [-35, -33], [-27, -33], [-19, -33], [-12, -34], [-4, -35], [6, -35], [16, -35],
      [28, -35], [38, -35], [46, -33],
      // East & South-East perimeter (outside coaster tracks)
      [50, -26], [51, -14], [51, 2], [50, 16], [48, 25], [44, 32],
      // Southern promenade & park border
      [36, 33], [28, 33], [20, 33], [12, 33], [4, 33], [-4, 33], [-14, 33], [-22, 33], [-31, 33], [-43, 33],
      // Midway plaza accents (carefully avoiding footpaths & buildings)
      [-33, 18], [-22, 18], [-33, -3], [-21, -26], [-15, -24], [-15, 29],
      // Scenic coaster interior islands & rock hill flanks
      [15, -10], [33, -10], [21, -26], [30, -26], [10, 22], [22, 22], [34, 22]
    ];

    const mapleColors = [pal.FOLIAGE_GOLD, pal.FOLIAGE_ORANGE, pal.FOLIAGE_CRIMSON];

    treePositions.forEach((tp, idx) => {
      const tx = tp[0];
      const tz = tp[1];
      const ty = CPE.WORLD.getRockHillHeight(tx, tz);
      const scale = 0.82 + (idx % 5) * 0.11;
      let tree;
      if (idx % 3 === 0) {
        tree = createPineTreeMesh(scale, pal);
      } else {
        tree = createMapleTreeMesh(scale, mapleColors[idx % mapleColors.length], pal);
      }
      tree.position.set(tx, ty, tz);
      tree.rotation.y = idx * 1.1;
      envGroup.add(tree);
    });

    // ~24 Wrought-Iron Lamp Posts with Warm Glowing Glass Lanterns
    const lampCoords = [
      [-42, 26], [-34, 26], [-26, 26], [-18, 26], [-12, 26],
      [-12, 21], [-12, 16], [-6, 16.5], [2, 16.5], [7, 16.5],
      [-22, 18], [-22, 11], [-22, 4], [-22, -3], [-22, -10], [-22, -17],
      [-28, 14], [-28, 2], [-33, 12], [-33, 4],
      [-32, -12], [-32, -22], [-21, -22], [14, 22]
    ];

    const ironMat = makeMat(pal.STEEL_DARK);
    const lanternMat = makeGlowMat(pal.WARM_GLOW, 0.3, 1.15);
    const postGeo = new THREE.CylinderGeometry(0.08, 0.13, 3.2, 6);
    const globeGeo = new THREE.BoxGeometry(0.38, 0.52, 0.38);
    const capGeo = new THREE.ConeGeometry(0.34, 0.28, 4);

    lampCoords.forEach((lc) => {
      const lamp = new THREE.Group();
      lamp.position.set(lc[0], 0, lc[1]);

      const pole = new THREE.Mesh(postGeo, ironMat);
      pole.position.y = 1.6;
      pole.castShadow = true;
      lamp.add(pole);

      const globe = new THREE.Mesh(globeGeo, lanternMat);
      globe.position.y = 3.4;
      lamp.add(globe);

      const cap = new THREE.Mesh(capGeo, ironMat);
      cap.position.y = 3.78;
      cap.rotation.y = Math.PI / 4;
      lamp.add(cap);

      envGroup.add(lamp);
    });

    // Festive Pennant Bunting & Fairy Bulb Strings between lamp posts and stalls
    const buntingSpans = [
      [[-34, 3.4, 26], [-26, 3.4, 26]],
      [[-26, 3.4, 26], [-18, 3.4, 26]],
      [[-18, 3.4, 26], [-12, 3.4, 26]],
      [[-22, 3.4, 18], [-22, 3.4, 11]],
      [[-22, 3.4, 11], [-22, 3.4, 4]],
      [[-22, 3.4, 4], [-22, 3.4, -3]],
      [[-22, 3.4, -3], [-22, 3.4, -10]],
      [[-22, 3.4, -10], [-22, 3.4, -17]],
      [[-28, 3.4, 14], [-22, 3.4, 11]],
      [[-28, 3.4, 2], [-22, 3.4, 4]],
      [[-33, 3.4, 12], [-28, 3.4, 14]],
      [[-32, 3.4, -12], [-22, 3.4, -10]],
      [[-32, 3.4, -22], [-21, 3.4, -22]]
    ];

    const flagColors = [pal.CHERRY_RED, pal.GOLD, pal.STEEL_TEAL, pal.CREAM, pal.FOLIAGE_ORANGE];
    const flagGeo = new THREE.ConeGeometry(0.16, 0.34, 3);
    flagGeo.rotateX(Math.PI);

    buntingSpans.forEach((span) => {
      const pA = new THREE.Vector3(span[0][0], span[0][1], span[0][2]);
      const pB = new THREE.Vector3(span[1][0], span[1][1], span[1][2]);
      const count = 11;
      for (let i = 1; i < count; i++) {
        const t = i / count;
        const x = pA.x + (pB.x - pA.x) * t;
        const z = pA.z + (pB.z - pA.z) * t;
        const sag = Math.sin(t * Math.PI) * 0.55;
        const y = pA.y + (pB.y - pA.y) * t - sag;

        const flag = new THREE.Mesh(flagGeo, i % 3 === 0 ? lanternMat : makeMat(flagColors[i % flagColors.length]));
        flag.position.set(x, y, z);
        envGroup.add(flag);
      }
    });

    // Coaster Viewing Fence along X = -12.8, Z in [-12, 15] separating midway from coaster zone
    const fenceMat = makeMat(pal.TIMBER_MID);
    for (let z = -12; z <= 14; z += 2) {
      const fPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fenceMat);
      fPost.position.set(-12.8, 0.55, z);
      envGroup.add(fPost);
    }
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 26.2), fenceMat);
    topRail.position.set(-12.8, 0.95, 1.0);
    envGroup.add(topRail);

    const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 26.2), fenceMat);
    midRail.position.set(-12.8, 0.52, 1.0);
    envGroup.add(midRail);

    root.add(envGroup);
  }

  // ---------------------------------------------------------------------------
  // 6. ~140 Instanced Box-People (Strollers, Queueing, Sitting/Eating, Spectators)
  // ---------------------------------------------------------------------------
  const WAYPOINTS = [
    { x: -38.0, z: 26.5 }, // 0: Entrance Gate
    { x: -30.0, z: 24.5 }, // 1: Ticket Booth
    { x: -24.5, z: 24.5 }, // 2: South Midway Junction
    { x: -13.5, z: 24.5 }, // 3: Queue Entrance
    { x: -24.5, z: 14.0 }, // 4: South Plaza
    { x: -24.5, z: 8.0 },  // 5: Fountain East
    { x: -31.5, z: 8.0 },  // 6: Cafe Plaza
    { x: -24.5, z: 2.0 },  // 7: Cider Stall Front
    { x: -24.5, z: -6.0 }, // 8: Ring Toss Stall Front
    { x: -24.5, z: -14.0 },// 9: Candy Apple Stall Front
    { x: -26.0, z: -18.5 },// 10: Carousel South
    { x: -33.5, z: -14.0 },// 11: Ferris Wheel Plaza
    { x: -15.0, z: 8.0 },  // 12: Coaster Overlook South
    { x: -15.0, z: -4.0 }  // 13: Coaster Overlook North
  ];

  const WAYPOINT_ADJ = [
    [1],             // 0
    [0, 2],          // 1
    [1, 3, 4],       // 2
    [2],             // 3
    [2, 5],          // 4
    [4, 6, 7, 12],   // 5
    [5, 11],         // 6
    [5, 8],          // 7
    [7, 9, 13],      // 8
    [8, 10, 11],     // 9
    [9, 11],         // 10
    [6, 9, 10],      // 11
    [5, 13],         // 12
    [8, 12]          // 13
  ];

  // Switchback Queue polyline points from queue entrance (-10.0, 25.3) to station boarding stairs (-2.5, 16.6)
  const QUEUE_PATH = [
    new THREE.Vector3(-10.2, 0, 25.3),
    new THREE.Vector3(0.4, 0, 25.3),
    new THREE.Vector3(0.4, 0, 22.9),
    new THREE.Vector3(-9.4, 0, 22.9),
    new THREE.Vector3(-9.4, 0, 20.5),
    new THREE.Vector3(0.4, 0, 20.5),
    new THREE.Vector3(0.4, 0, 18.2),
    new THREE.Vector3(-3.0, 0, 18.2),
    new THREE.Vector3(-3.0, 0, 16.6)
  ];

  function samplePolyline(pts, tNorm) {
    let totalLen = 0;
    const segLens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = pts[i].distanceTo(pts[i + 1]);
      segLens.push(l);
      totalLen += l;
    }
    let target = ((tNorm % 1) + 1) % 1 * totalLen;
    for (let i = 0; i < segLens.length; i++) {
      if (target <= segLens[i] || i === segLens.length - 1) {
        const f = segLens[i] > 0 ? target / segLens[i] : 0;
        const pos = pts[i].clone().lerp(pts[i + 1], f);
        const yaw = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        return { pos, yaw };
      }
      target -= segLens[i];
    }
    return { pos: pts[0].clone(), yaw: 0 };
  }

  function buildInstancedGuests(root) {
    const pal = P();
    const guestGroup = new THREE.Group();
    guestGroup.name = 'InstancedGuests';

    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

    const legsGeo = new THREE.BoxGeometry(0.28, 0.38, 0.2);
    const torsoGeo = new THREE.BoxGeometry(0.34, 0.42, 0.22);
    const headGeo = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    const armGeo = new THREE.BoxGeometry(0.11, 0.36, 0.11);
    // Offset arm geometry pivot to shoulder top so rotating x swings/raises the arm naturally
    armGeo.translate(0, -0.14, 0);

    guestMeshes = {
      legs: new THREE.InstancedMesh(legsGeo, whiteMat, GUEST_COUNT),
      torso: new THREE.InstancedMesh(torsoGeo, whiteMat, GUEST_COUNT),
      head: new THREE.InstancedMesh(headGeo, whiteMat, GUEST_COUNT),
      leftArm: new THREE.InstancedMesh(armGeo, whiteMat, GUEST_COUNT),
      rightArm: new THREE.InstancedMesh(armGeo, whiteMat, GUEST_COUNT)
    };

    Object.values(guestMeshes).forEach((im) => {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      guestGroup.add(im);
    });

    const coatPalette = [
      pal.CHERRY_RED,
      pal.GOLD,
      pal.STEEL_TEAL,
      pal.FOLIAGE_ORANGE,
      pal.PLUM_ROCK_LIGHT,
      pal.FOLIAGE_CRIMSON,
      pal.GRASS_MOSS,
      pal.BRICK_RED
    ];
    const pantsPalette = [pal.STEEL_DARK, pal.TIMBER_DARK, pal.PLUM_ROCK_DARK, pal.SLATE_ROOF];
    const skinPalette = [0xf4d2b5, 0xe2b18c, 0xc68c63, 0x8d5838];

    guests = [];

    // Seating coordinates for the 24 Sitting & Eating guests (16 at Cafe Patio, 8 at Fountain Benches)
    const seatSpots = [];
    const patioTables = [
      { x: -31.2, z: 4.8 },
      { x: -31.2, z: 8.0 },
      { x: -31.2, z: 11.2 },
      { x: -34.8, z: 13.6 }
    ];
    patioTables.forEach((pt) => {
      for (let c = 0; c < 4; c++) {
        const ang = (c / 4) * Math.PI * 2 + 0.4;
        seatSpots.push({
          x: pt.x + Math.cos(ang) * 1.25,
          z: pt.z + Math.sin(ang) * 1.25,
          yaw: Math.atan2(-Math.cos(ang), -Math.sin(ang))
        });
      }
    });
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + Math.PI / 4;
      const bx = -27 + Math.cos(a) * 4.4;
      const bz = 8 + Math.sin(a) * 4.4;
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      [-0.42, 0.42].forEach((off) => {
        seatSpots.push({
          x: bx + tx * off,
          z: bz + tz * off,
          yaw: Math.atan2(-Math.cos(a), -Math.sin(a))
        });
      });
    }

    for (let i = 0; i < GUEST_COUNT; i++) {
      const coatHex = coatPalette[i % coatPalette.length];
      const pantsHex = pantsPalette[i % pantsPalette.length];
      const skinHex = skinPalette[i % skinPalette.length];

      guestMeshes.legs.setColorAt(i, _color.setHex(pantsHex));
      guestMeshes.torso.setColorAt(i, _color.setHex(coatHex));
      guestMeshes.head.setColorAt(i, _color.setHex(skinHex));
      guestMeshes.leftArm.setColorAt(i, _color.setHex(coatHex));
      guestMeshes.rightArm.setColorAt(i, _color.setHex(coatHex));

      let role = 'stroller';
      if (i >= 65 && i < 100) role = 'queue';
      else if (i >= 100 && i < 124) role = 'sitting';
      else if (i >= 124) role = 'spectator';

      const g = {
        index: i,
        role,
        pos: new THREE.Vector3(),
        yaw: 0,
        phase: rand() * Math.PI * 2,
        speed: randRange(1.35, 2.05),
        cheerFactor: 0,
        wpFrom: 0,
        wpTo: 1,
        wpT: rand(),
        laneOffset: (rand() - 0.5) * 1.6,
        pauseTimer: 0,
        queueT: 0
      };

      if (role === 'stroller') {
        const wIdx = i % WAYPOINTS.length;
        const adj = WAYPOINT_ADJ[wIdx];
        g.wpFrom = wIdx;
        g.wpTo = adj[i % adj.length];
        g.wpT = rand();
      } else if (role === 'queue') {
        const qIdx = i - 65;
        g.queueT = qIdx / 35;
      } else if (role === 'sitting') {
        const sIdx = (i - 100) % seatSpots.length;
        g.pos.set(seatSpots[sIdx].x, 0, seatSpots[sIdx].z);
        g.yaw = seatSpots[sIdx].yaw;
      } else if (role === 'spectator') {
        const spIdx = i - 124;
        if (spIdx < 11) {
          g.pos.set(-13.4 + (spIdx % 2) * -0.45, 0, -10.0 + spIdx * 2.3);
          g.yaw = Math.PI / 2; // facing East (+X) toward coaster zone
        } else {
          const k = spIdx - 11;
          g.pos.set(-5.0 + k * 2.8, 0, 17.6);
          g.yaw = Math.PI; // facing North (-Z) toward station & track
        }
      }

      guests.push(g);
    }

    Object.values(guestMeshes).forEach((im) => {
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });

    root.add(guestGroup);
  }

  function updateInstancedGuests(dt, elapsed) {
    if (!guestMeshes || guests.length === 0) return;

    // Fetch live train position & speed from CPE.WORLD or CPE.RIDE
    let trainPos = CPE.WORLD && CPE.WORLD.trainPos ? CPE.WORLD.trainPos : null;
    let trainSpeed = CPE.WORLD && CPE.WORLD.trainSpeed !== undefined ? CPE.WORLD.trainSpeed : 0;

    if (CPE.RIDE) {
      if (CPE.RIDE.cars && CPE.RIDE.cars[0] && CPE.RIDE.cars[0].pos) {
        trainPos = CPE.RIDE.cars[0].pos;
        if (CPE.WORLD && CPE.WORLD.trainPos) CPE.WORLD.trainPos.copy(trainPos);
      }
      if (CPE.RIDE.speed !== undefined) {
        trainSpeed = CPE.RIDE.speed;
        if (CPE.WORLD) CPE.WORLD.trainSpeed = trainSpeed;
      }
    }

    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      let isWalking = false;

      if (g.role === 'stroller') {
        if (g.pauseTimer > 0) {
          g.pauseTimer -= dt;
        } else {
          isWalking = true;
          const pA = WAYPOINTS[g.wpFrom];
          const pB = WAYPOINTS[g.wpTo];
          const dist = Math.max(0.5, Math.hypot(pB.x - pA.x, pB.z - pA.z));
          g.wpT += (g.speed * dt) / dist;
          if (g.wpT >= 1.0) {
            g.wpT = 0;
            const prev = g.wpFrom;
            g.wpFrom = g.wpTo;
            const candidates = WAYPOINT_ADJ[g.wpFrom];
            if (candidates.length > 1) {
              const filtered = candidates.filter((c) => c !== prev);
              g.wpTo = filtered[Math.floor((elapsed * 13 + i * 7) % filtered.length)];
            } else {
              g.wpTo = candidates[0];
            }
            // Occasionally pause at stalls or plazas
            if ((i + Math.floor(elapsed)) % 5 === 0) {
              g.pauseTimer = 1.4;
            }
          }
          const curA = WAYPOINTS[g.wpFrom];
          const curB = WAYPOINTS[g.wpTo];
          const dx = curB.x - curA.x;
          const dz = curB.z - curA.z;
          const len = Math.max(0.01, Math.hypot(dx, dz));
          const nx = -dz / len;
          const nz = dx / len;
          g.pos.set(
            curA.x + dx * g.wpT + nx * g.laneOffset,
            0,
            curA.z + dz * g.wpT + nz * g.laneOffset
          );
          g.yaw = Math.atan2(dx, dz);
        }
      } else if (g.role === 'queue') {
        g.queueT = (g.queueT + dt * 0.016) % 1.0;
        const samp = samplePolyline(QUEUE_PATH, g.queueT);
        g.pos.copy(samp.pos);
        g.yaw = samp.yaw;
        isWalking = true;
      }

      // Check distance to passing coaster train for cheering!
      let targetCheer = 0;
      let displayYaw = g.yaw;
      if (trainPos && trainSpeed > 5.0) {
        const dx = trainPos.x - g.pos.x;
        const dy = trainPos.y - g.pos.y;
        const dz = trainPos.z - g.pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 15.0) {
          targetCheer = 1.0;
          displayYaw = Math.atan2(dx, dz);
        }
      }
      g.cheerFactor += (targetCheer - g.cheerFactor) * Math.min(1, dt * 8.0);

      // Compute bounce & limb angles
      const walkCycle = elapsed * 7.5 + g.phase;
      let bobY = 0;
      let leftArmRotX = 0;
      let rightArmRotX = 0;
      const baseHeight = g.role === 'sitting' ? -0.14 : 0;

      if (g.cheerFactor > 0.15) {
        const jump = Math.abs(Math.sin(elapsed * 12.0 + g.phase)) * 0.24 * g.cheerFactor;
        bobY = jump;
        // Raise both arms high overhead and wave!
        leftArmRotX = -2.75 + Math.sin(elapsed * 15.0 + g.phase) * 0.25;
        rightArmRotX = -2.75 - Math.sin(elapsed * 15.0 + g.phase) * 0.25;
      } else if (g.role === 'sitting') {
        // Seated guests periodically raise a hand to eat/drink
        const sip = Math.max(0, Math.sin(elapsed * 2.4 + g.phase));
        rightArmRotX = -sip * 1.45;
        leftArmRotX = -0.35;
        displayYaw = g.yaw + Math.sin(elapsed * 1.2 + g.phase) * 0.18;
      } else if (isWalking) {
        bobY = Math.abs(Math.sin(walkCycle)) * 0.06;
        const swing = Math.sin(walkCycle) * 0.55;
        leftArmRotX = swing;
        rightArmRotX = -swing;
      }

      const gx = g.pos.x;
      const gy = baseHeight + bobY;
      const gz = g.pos.z;

      // Legs
      _dummy.position.set(gx, gy + 0.19, gz);
      _dummy.rotation.set(0, displayYaw, 0);
      _dummy.scale.set(1, g.role === 'sitting' ? 0.65 : 1, 1);
      _dummy.updateMatrix();
      guestMeshes.legs.setMatrixAt(i, _dummy.matrix);

      // Torso
      _dummy.position.set(gx, gy + 0.58, gz);
      _dummy.rotation.set(0, displayYaw, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      guestMeshes.torso.setMatrixAt(i, _dummy.matrix);

      // Head
      _dummy.position.set(gx, gy + 0.94, gz);
      _dummy.rotation.set(0, displayYaw, 0);
      _dummy.updateMatrix();
      guestMeshes.head.setMatrixAt(i, _dummy.matrix);

      // Shoulder offsets rotated by displayYaw
      const cosY = Math.cos(displayYaw);
      const sinY = Math.sin(displayYaw);
      const shOff = 0.23;

      // Left Arm
      _dummy.position.set(gx - cosY * shOff, gy + 0.75, gz + sinY * shOff);
      _dummy.rotation.set(leftArmRotX, displayYaw, 0);
      _dummy.updateMatrix();
      guestMeshes.leftArm.setMatrixAt(i, _dummy.matrix);

      // Right Arm
      _dummy.position.set(gx + cosY * shOff, gy + 0.75, gz - sinY * shOff);
      _dummy.rotation.set(rightArmRotX, displayYaw, 0);
      _dummy.updateMatrix();
      guestMeshes.rightArm.setMatrixAt(i, _dummy.matrix);
    }

    guestMeshes.legs.instanceMatrix.needsUpdate = true;
    guestMeshes.torso.instanceMatrix.needsUpdate = true;
    guestMeshes.head.instanceMatrix.needsUpdate = true;
    guestMeshes.leftArm.instanceMatrix.needsUpdate = true;
    guestMeshes.rightArm.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // 7A. Falling Autumn Leaves (~180 Instanced Quads)
  // ---------------------------------------------------------------------------
  function buildFallingLeaves(root) {
    const pal = P();
    const leafGeo = new THREE.PlaneGeometry(0.24, 0.24);
    const leafMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      flatShading: true
    });

    leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_COUNT);
    leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const leafPalette = [pal.FOLIAGE_GOLD, pal.FOLIAGE_ORANGE, pal.FOLIAGE_CRIMSON, pal.GRASS_DRY];
    leaves = [];

    for (let i = 0; i < LEAF_COUNT; i++) {
      leafMesh.setColorAt(i, _color.setHex(leafPalette[i % leafPalette.length]));
      leaves.push({
        x: randRange(-48, 48),
        y: randRange(0.5, 14.0),
        z: randRange(-34, 34),
        vy: randRange(0.75, 1.45),
        swayFreq: randRange(1.2, 2.6),
        swayAmp: randRange(0.5, 1.3),
        phase: rand() * Math.PI * 2
      });
    }
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    root.add(leafMesh);
  }

  function updateFallingLeaves(dt, elapsed) {
    if (!leafMesh) return;
    for (let i = 0; i < LEAF_COUNT; i++) {
      const lf = leaves[i];
      lf.y -= lf.vy * dt;
      if (lf.y <= 0.05) {
        lf.y = 11.5 + (i % 5) * 1.1;
      }
      const x = lf.x + Math.sin(elapsed * lf.swayFreq + lf.phase) * lf.swayAmp;
      const z = lf.z + Math.cos(elapsed * lf.swayFreq * 0.8 + lf.phase) * lf.swayAmp;

      _dummy.position.set(x, lf.y, z);
      _dummy.rotation.set(
        elapsed * 1.8 + lf.phase,
        elapsed * 1.3 + lf.phase,
        Math.sin(elapsed * 2.5 + lf.phase) * 0.8
      );
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      leafMesh.setMatrixAt(i, _dummy.matrix);
    }
    leafMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // 7B. Night Fireworks (Shells & 45-Particle Glowing Bursts when nightFactor > 0.55)
  // ---------------------------------------------------------------------------
  function buildFireworks(root) {
    const fwGeo = new THREE.BoxGeometry(0.36, 0.36, 0.36);
    const fwMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    fireworkMesh = new THREE.InstancedMesh(fwGeo, fwMat, TOTAL_FW_PARTICLES);
    fireworkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fireworkMesh.frustumCulled = false;

    for (let i = 0; i < TOTAL_FW_PARTICLES; i++) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.set(0.001, 0.001, 0.001);
      _dummy.updateMatrix();
      fireworkMesh.setMatrixAt(i, _dummy.matrix);
      fireworkMesh.setColorAt(i, _color.setHex(0xffd275));
    }
    if (fireworkMesh.instanceColor) fireworkMesh.instanceColor.needsUpdate = true;
    root.add(fireworkMesh);
  }

  function spawnFireworkRocket() {
    const pal = P();
    const burstColors = [pal.GOLD, pal.CHERRY_RED, pal.WARM_GLOW, pal.FOLIAGE_ORANGE, 0x62e8ff, 0xff7be5];
    const color = burstColors[Math.floor(rand() * burstColors.length)];
    const x = randRange(-38, 22);
    const z = randRange(-37.5, -34.0);
    const targetY = randRange(28, 38);

    fireworkRockets.push({
      x,
      y: 0.5,
      z,
      vy: randRange(22, 27),
      targetY,
      color
    });

    if (CPE.events && CPE.events.emit) {
      CPE.events.emit('fireworkLaunch', { x, y: 0.5, z });
    }
  }

  function triggerFireworkBurst(rx, ry, rz, color) {
    if (CPE.events && CPE.events.emit) {
      CPE.events.emit('fireworkBurst', { x: rx, y: ry, z: rz, color });
    }

    const particles = [];
    for (let i = 0; i < FIREWORK_PARTICLES_PER_BURST; i++) {
      // Fibonacci sphere distribution for an even, crisp spherical burst
      const phi = Math.acos(1 - (2 * (i + 0.5)) / FIREWORK_PARTICLES_PER_BURST);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const spd = randRange(8.5, 13.5);
      particles.push({
        x: rx,
        y: ry,
        z: rz,
        vx: Math.sin(phi) * Math.cos(theta) * spd,
        vy: Math.cos(phi) * spd,
        vz: Math.sin(phi) * Math.sin(theta) * spd
      });
    }

    if (fireworkBursts.length >= MAX_BURSTS) {
      fireworkBursts.shift();
    }
    fireworkBursts.push({
      x: rx,
      y: ry,
      z: rz,
      color,
      age: 0,
      maxAge: 1.85,
      particles
    });
  }

  function updateFireworks(dt, nightFactor) {
    if (!fireworkMesh) return;

    if (nightFactor > 0.55) {
      nextFireworkTimer -= dt;
      if (nextFireworkTimer <= 0) {
        spawnFireworkRocket();
        nextFireworkTimer = randRange(2.5, 4.0);
      }
    }

    // Reset all instances off-screen first
    for (let i = 0; i < TOTAL_FW_PARTICLES; i++) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.set(0.001, 0.001, 0.001);
      _dummy.updateMatrix();
      fireworkMesh.setMatrixAt(i, _dummy.matrix);
    }

    // Update ascending shells (slots at end of instanced mesh)
    const rocketSlotBase = MAX_BURSTS * FIREWORK_PARTICLES_PER_BURST;
    for (let r = fireworkRockets.length - 1; r >= 0; r--) {
      const rk = fireworkRockets[r];
      rk.y += rk.vy * dt;
      if (rk.y >= rk.targetY) {
        triggerFireworkBurst(rk.x, rk.y, rk.z, rk.color);
        fireworkRockets.splice(r, 1);
      } else if (r < 4) {
        const slot = rocketSlotBase + r;
        _dummy.position.set(rk.x, rk.y, rk.z);
        _dummy.scale.set(0.85, 1.4, 0.85);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        fireworkMesh.setMatrixAt(slot, _dummy.matrix);
        fireworkMesh.setColorAt(slot, _color.setHex(0xffd275));
      }
    }

    // Update expanding bursts
    let brightestBurst = null;
    for (let b = fireworkBursts.length - 1; b >= 0; b--) {
      const burst = fireworkBursts[b];
      burst.age += dt;
      if (burst.age >= burst.maxAge) {
        fireworkBursts.splice(b, 1);
        continue;
      }
      if (!brightestBurst || burst.age < brightestBurst.age) {
        brightestBurst = burst;
      }

      const life = 1 - burst.age / burst.maxAge;
      const scale = Math.max(0.05, life * 1.35);
      const baseIdx = b * FIREWORK_PARTICLES_PER_BURST;
      _color.setHex(burst.color);

      for (let p = 0; p < burst.particles.length; p++) {
        const pt = burst.particles[p];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.z += pt.vz * dt;
        pt.vy -= 5.5 * dt; // gravity
        pt.vx *= 1 - 0.65 * dt;
        pt.vz *= 1 - 0.65 * dt;

        const slot = baseIdx + p;
        _dummy.position.set(pt.x, pt.y, pt.z);
        _dummy.scale.set(scale, scale, scale);
        _dummy.rotation.set(burst.age * 3, burst.age * 2, 0);
        _dummy.updateMatrix();
        fireworkMesh.setMatrixAt(slot, _dummy.matrix);
        fireworkMesh.setColorAt(slot, _color);
      }
    }

    // Flash CPE.LIGHTS.fireworkLight (or slot 5 point light) during active bursts
    const fwLight =
      (CPE.LIGHTS && CPE.LIGHTS.fireworkLight) ||
      (CPE.LIGHTS && CPE.LIGHTS.pointLights && CPE.LIGHTS.pointLights[5]);
    if (fwLight) {
      if (brightestBurst) {
        const flash = Math.max(0, 1 - brightestBurst.age / (brightestBurst.maxAge * 0.75));
        fwLight.position.set(brightestBurst.x, brightestBurst.y, brightestBurst.z);
        fwLight.color.setHex(brightestBurst.color);
        fwLight.intensity = flash * 3.2;
      } else {
        fwLight.intensity = 0;
      }
    }

    fireworkMesh.instanceMatrix.needsUpdate = true;
    if (fireworkMesh.instanceColor) fireworkMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Public API: CPE.PARK.init(scene) and CPE.PARK.update(dt, elapsed, nightFactor)
  // ---------------------------------------------------------------------------
  CPE.PARK = {
    init: function (scene) {
      seed = 421337;
      parkGroup = new THREE.Group();
      parkGroup.name = 'CinderpineParkDiorama';

      buildFloatingIsland(parkGroup);
      buildEntranceGateAndQueue(parkGroup);
      buildFairgroundStalls(parkGroup);
      buildAutumnCafe(parkGroup);
      buildPlazaFountain(parkGroup);
      buildFerrisWheel(parkGroup);
      buildCarousel(parkGroup);
      buildTreesLampPostsAndBunting(parkGroup);
      buildInstancedGuests(parkGroup);
      buildFallingLeaves(parkGroup);
      buildFireworks(parkGroup);

      if (scene) {
        scene.add(parkGroup);
      }
      return parkGroup;
    },

    update: function (dt, elapsed, nightFactor) {
      const safeDt = Math.min(0.1, Math.max(0.0001, dt || 0.016));
      const t = elapsed !== undefined ? elapsed : performance.now() * 0.001;
      const nf =
        nightFactor !== undefined
          ? nightFactor
          : CPE.lighting && CPE.lighting.nightFactor !== undefined
          ? CPE.lighting.nightFactor
          : 0;

      // Upgrade mine portals if CPE.COASTERS[2] was initialized after CPE.PARK.init
      if (!minePortalsBuilt && CPE.COASTERS && CPE.COASTERS[2] && CPE.COASTERS[2].tunnelRanges) {
        buildOrUpdateMinePortals(P());
      }

      // Update glow materials fallback
      updateLocalGlowMaterials(nf);

      // 1. Floating Satellite Rock Islets gentle drift
      for (let i = 0; i < satelliteIslets.length; i++) {
        const isl = satelliteIslets[i];
        isl.group.position.y = isl.baseY + Math.sin(t * isl.speed + isl.phase) * 0.45;
        isl.group.rotation.y = Math.sin(t * 0.35 + isl.phase) * 0.08;
      }

      // 2. Ferris Wheel rotation & counter-rotating upright gondolas
      if (ferrisWheelGroup) {
        ferrisWheelGroup.rotation.z = t * 0.28;
        const invRot = -ferrisWheelGroup.rotation.z;
        for (let i = 0; i < ferrisGondolas.length; i++) {
          // Gondola stays upright with a subtle pendulum sway
          ferrisGondolas[i].rotation.z = invRot + Math.sin(t * 1.9 + i) * 0.05;
        }
      }

      // 3. Carousel rotation & sine-wave bobbing mounts
      if (carouselPlatformGroup) {
        carouselPlatformGroup.rotation.y = t * 0.65;
        for (let i = 0; i < carouselMounts.length; i++) {
          const m = carouselMounts[i];
          m.group.position.y = m.baseY + Math.sin(t * 3.4 + m.phase) * 0.28;
        }
      }

      // 4. Fountain jumping water arcs
      if (fountainMesh && fountainDrops.length > 0) {
        for (let i = 0; i < fountainDrops.length; i++) {
          const fd = fountainDrops[i];
          const p = (t * 1.35 + fd.phase) % 1.0;
          const rStart = fd.tier === 0 ? 0.15 : 1.1;
          const rEnd = fd.tier === 0 ? 1.35 : 2.65;
          const yStart = fd.tier === 0 ? 3.15 : 2.1;
          const yEnd = fd.tier === 0 ? 2.08 : 0.8;
          const arcPeak = fd.tier === 0 ? 1.15 : 0.85;

          const r = rStart + (rEnd - rStart) * p;
          const y = yStart + (yEnd - yStart) * p + Math.sin(p * Math.PI) * arcPeak;
          const x = Math.cos(fd.angle) * r;
          const z = Math.sin(fd.angle) * r;

          _dummy.position.set(x, y, z);
          _dummy.rotation.set(t * 3 + i, fd.angle, 0);
          const sc = 0.7 + Math.sin(p * Math.PI) * 0.55;
          _dummy.scale.set(sc, sc, sc);
          _dummy.updateMatrix();
          fountainMesh.setMatrixAt(i, _dummy.matrix);
        }
        fountainMesh.instanceMatrix.needsUpdate = true;
      }

      // 5. Cafe Chimney gentle rising smoke puffs
      for (let i = 0; i < smokePuffs.length; i++) {
        const sp = smokePuffs[i];
        const p = (t * 0.35 + sp.phase) % 1.0;
        sp.mesh.position.set(
          sp.baseX + Math.sin(p * Math.PI * 2 + i) * 0.35 + p * 0.6,
          sp.baseY + p * 3.6,
          sp.baseZ + Math.cos(p * Math.PI * 2 + i) * 0.25
        );
        const s = 0.55 + p * 1.45;
        sp.mesh.scale.set(s, s, s);
      }

      // 6. Instanced Box-People (140 guests + cheering when train passes)
      updateInstancedGuests(safeDt, t);

      // 7. Falling Autumn Leaves & Night Fireworks
      updateFallingLeaves(safeDt, t);
      updateFireworks(safeDt, nf);
    }
  };
})();
