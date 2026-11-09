// Cinderpine Express — 3D Coaster Rails, Supports, Grand Station & 5-Car Train Builder
(function () {
  const CPE = (window.CPE = window.CPE || {});

  // ============================================================================
  // 1. DEFENSIVE MATERIAL & PALETTE HELPERS
  // ============================================================================
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

  function getPalette() {
    return Object.assign({}, DEFAULT_PALETTE, CPE.PALETTE || {});
  }

  const matCache = new Map();
  function makeMat(hex, opts) {
    if (typeof CPE.makeMat === 'function') {
      return CPE.makeMat(hex, opts);
    }
    const key = hex + '_' + JSON.stringify(opts || {});
    if (matCache.has(key)) return matCache.get(key);
    const params = Object.assign({ color: hex, flatShading: true }, opts || {});
    const mat = new THREE.MeshLambertMaterial(params);
    matCache.set(key, mat);
    return mat;
  }

  const localGlowMats = [];
  function makeGlowMat(hex, dayIntensity, nightIntensity) {
    const dInt = dayIntensity !== undefined ? dayIntensity : 0.15;
    const nInt = nightIntensity !== undefined ? nightIntensity : 0.95;
    if (typeof CPE.makeGlowMat === 'function') {
      return CPE.makeGlowMat(hex, nInt);
    }
    const mat = new THREE.MeshLambertMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: dInt,
      flatShading: true
    });
    if (typeof CPE.registerGlowMaterial === 'function') {
      CPE.registerGlowMaterial(mat, hex, dInt, nInt);
    } else {
      localGlowMats.push({ mat, baseColor: new THREE.Color(hex), dayIntensity: dInt, nightIntensity: nInt });
    }
    return mat;
  }

  function updateLocalGlowMaterials() {
    // If CPE.registerGlowMaterial became available after init, hand off once
    const nf = (CPE.lighting && typeof CPE.lighting.nightFactor === 'number') ? CPE.lighting.nightFactor : 0;
    for (let i = 0; i < localGlowMats.length; i++) {
      const g = localGlowMats[i];
      if (typeof CPE.registerGlowMaterial === 'function' && !g.registered) {
        CPE.registerGlowMaterial(g.mat, g.baseColor.getHex(), g.dayIntensity, g.nightIntensity);
        g.registered = true;
      } else if (!g.registered) {
        const intensity = g.dayIntensity + (g.nightIntensity - g.dayIntensity) * nf;
        g.mat.emissiveIntensity = intensity;
      }
    }
  }

  // ============================================================================
  // 2. GEOMETRY HELPERS (EXTRUDED RAILS & MERGED BUFFERS)
  // ============================================================================

  /**
   * Extrudes a closed-loop rail geometry along coaster.points using the precomputed
   * banked orthonormal frame (tangent, normal, binormal) at every point.
   */
  function buildClosedExtrudedRail(points, offsetBinormal, offsetNormal, profilePts) {
    const M = points.length;
    const P = profilePts.length; // array of [bx, ny] in local track cross-section
    const ringCount = M + 1;
    const vertCount = ringCount * P;

    const positions = new Float32Array(vertCount * 3);
    const indices = [];

    const pVec = new THREE.Vector3();
    for (let i = 0; i <= M; i++) {
      const pt = points[i % M];
      const cx = pt.pos.x + pt.binormal.x * offsetBinormal + pt.normal.x * offsetNormal;
      const cy = pt.pos.y + pt.binormal.y * offsetBinormal + pt.normal.y * offsetNormal;
      const cz = pt.pos.z + pt.binormal.z * offsetBinormal + pt.normal.z * offsetNormal;

      for (let j = 0; j < P; j++) {
        const bx = profilePts[j][0];
        const ny = profilePts[j][1];
        const vIdx = (i * P + j) * 3;
        positions[vIdx]     = cx + pt.binormal.x * bx + pt.normal.x * ny;
        positions[vIdx + 1] = cy + pt.binormal.y * bx + pt.normal.y * ny;
        positions[vIdx + 2] = cz + pt.binormal.z * bx + pt.normal.z * ny;
      }
    }

    for (let i = 0; i < M; i++) {
      const r0 = i * P;
      const r1 = (i + 1) * P;
      for (let j = 0; j < P; j++) {
        const jNext = (j + 1) % P;
        const a = r0 + j;
        const b = r1 + j;
        const c = r1 + jNext;
        const d = r0 + jNext;
        indices.push(a, b, c, a, c, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Extrudes an open segment rail geometry along a subset of points.
   */
  function buildOpenExtrudedSegment(segPoints, offsetBinormal, offsetNormal, profilePts) {
    const M = segPoints.length;
    if (M < 2) return null;
    const P = profilePts.length;
    const vertCount = M * P;
    const positions = new Float32Array(vertCount * 3);
    const indices = [];

    for (let i = 0; i < M; i++) {
      const pt = segPoints[i];
      const cx = pt.pos.x + pt.binormal.x * offsetBinormal + pt.normal.x * offsetNormal;
      const cy = pt.pos.y + pt.binormal.y * offsetBinormal + pt.normal.y * offsetNormal;
      const cz = pt.pos.z + pt.binormal.z * offsetBinormal + pt.normal.z * offsetNormal;

      for (let j = 0; j < P; j++) {
        const bx = profilePts[j][0];
        const ny = profilePts[j][1];
        const vIdx = (i * P + j) * 3;
        positions[vIdx]     = cx + pt.binormal.x * bx + pt.normal.x * ny;
        positions[vIdx + 1] = cy + pt.binormal.y * bx + pt.normal.y * ny;
        positions[vIdx + 2] = cz + pt.binormal.z * bx + pt.normal.z * ny;
      }
    }

    for (let i = 0; i < M - 1; i++) {
      const r0 = i * P;
      const r1 = (i + 1) * P;
      for (let j = 0; j < P; j++) {
        const jNext = (j + 1) % P;
        const a = r0 + j;
        const b = r1 + j;
        const c = r1 + jNext;
        const d = r0 + jNext;
        indices.push(a, b, c, a, c, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  function makeCircleProfile(radius, sides) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
    return pts;
  }

  function makeRectProfile(halfW, halfH) {
    return [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH]
    ];
  }

  /**
   * Lightweight BufferGeometry collector for static struts/beams so each coaster's
   * support structure renders in just 1-2 draw calls.
   */
  function createStrutBuilder() {
    const positions = [];
    const indices = [];
    let vOffset = 0;

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const boxPos = unitBox.attributes.position.array;
    const boxIdx = unitBox.index.array;

    const p0 = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const upRef = new THREE.Vector3();
    const right = new THREE.Vector3();
    const localUp = new THREE.Vector3();
    const vTmp = new THREE.Vector3();

    return {
      // Adds a rectangular strut from point A to point B with width wX and thickness wZ
      addStrut(ax, ay, az, bx, by, bz, wX, wZ) {
        dir.set(bx - ax, by - ay, bz - az);
        const len = dir.length();
        if (len < 0.02) return;
        dir.multiplyScalar(1 / len);

        if (Math.abs(dir.y) > 0.92) {
          upRef.set(1, 0, 0);
        } else {
          upRef.set(0, 1, 0);
        }
        right.crossVectors(dir, upRef).normalize();
        localUp.crossVectors(right, dir).normalize();

        const cx = (ax + bx) * 0.5;
        const cy = (ay + by) * 0.5;
        const cz = (az + bz) * 0.5;

        for (let i = 0; i < boxPos.length; i += 3) {
          const lx = boxPos[i] * wX;
          const ly = boxPos[i + 1] * len;
          const lz = boxPos[i + 2] * wZ;

          const wx = cx + right.x * lx + dir.x * ly + localUp.x * lz;
          const wy = cy + right.y * lx + dir.y * ly + localUp.y * lz;
          const wz = cz + right.z * lx + dir.z * ly + localUp.z * lz;
          positions.push(wx, wy, wz);
        }

        for (let i = 0; i < boxIdx.length; i++) {
          indices.push(vOffset + boxIdx[i]);
        }
        vOffset += boxPos.length / 3;
      },

      // Adds an axis-aligned or yaw-rotated box at (cx, cy, cz)
      addBox(cx, cy, cz, sx, sy, sz, yaw) {
        const c = Math.cos(yaw || 0);
        const s = Math.sin(yaw || 0);
        for (let i = 0; i < boxPos.length; i += 3) {
          const lx = boxPos[i] * sx;
          const ly = boxPos[i + 1] * sy;
          const lz = boxPos[i + 2] * sz;
          const wx = cx + lx * c + lz * s;
          const wy = cy + ly;
          const wz = cz - lx * s + lz * c;
          positions.push(wx, wy, wz);
        }
        for (let i = 0; i < boxIdx.length; i++) {
          indices.push(vOffset + boxIdx[i]);
        }
        vOffset += boxPos.length / 3;
      },

      buildGeometry() {
        if (positions.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        return geom;
      }
    };
  }

  // ============================================================================
  // 3. COASTER TRACK, TIES, CHAIN LIFT, BRAKES & SUPPORTS BUILDER
  // ============================================================================

  const RAIL_GAUGE = 1.05;
  const HALF_GAUGE = RAIL_GAUGE * 0.5; // 0.525 m
  const RAIL_NORMAL_OFFSET = 0.08;
  const CHAIN_DOG_COUNT = 55;

  function isInsideStationFootprint(x, z) {
    return x >= -9.6 && x <= 7.6 && z >= 10.6 && z <= 17.4;
  }

  function buildCoasterGroup(coaster) {
    const P = getPalette();
    const group = new THREE.Group();
    group.name = 'Coaster_' + coaster.id;

    const pts = coaster.points;
    const M = pts.length;

    // --------------------------------------------------------------------------
    // A. RUNNING RAILS (Left & Right continuous closed loop meshes)
    // --------------------------------------------------------------------------
    const railProfile = coaster.type === 'steel'
      ? makeCircleProfile(0.055, 6)
      : makeRectProfile(0.048, 0.052);

    const railColor = coaster.type === 'steel'
      ? coaster.colorSecondary
      : (coaster.type === 'wood' ? coaster.colorSecondary : 0x9e3b2b);
    const railMat = makeMat(railColor);

    const leftRailGeom = buildClosedExtrudedRail(pts, -HALF_GAUGE, RAIL_NORMAL_OFFSET, railProfile);
    const rightRailGeom = buildClosedExtrudedRail(pts, +HALF_GAUGE, RAIL_NORMAL_OFFSET, railProfile);
    const leftRailMesh = new THREE.Mesh(leftRailGeom, railMat);
    const rightRailMesh = new THREE.Mesh(rightRailGeom, railMat);
    leftRailMesh.castShadow = true;
    rightRailMesh.castShadow = true;
    group.add(leftRailMesh, rightRailMesh);

    // --------------------------------------------------------------------------
    // B. SPINE / BACKBONE, SLEEPERS / TIES & CATWALKS BY COASTER TYPE
    // --------------------------------------------------------------------------
    const dummy = new THREE.Object3D();
    const rotMat = new THREE.Matrix4();

    if (coaster.type === 'steel') {
      // CINDERLOOP: Thick tubular steel backbone spine offset -0.35m along pt.normal
      const spineProfile = makeCircleProfile(0.145, 7);
      const spineGeom = buildClosedExtrudedRail(pts, 0.0, -0.35, spineProfile);
      const spineMat = makeMat(coaster.colorPrimary);
      const spineMesh = new THREE.Mesh(spineGeom, spineMat);
      spineMesh.castShadow = true;
      spineMesh.receiveShadow = true;
      group.add(spineMesh);

      // V-shaped steel cross-ties connecting spine (0, -0.35) to running rails (±0.525, +0.08)
      // Build a custom V-yoke geometry in local frame (X = binormal, Y = normal, Z = tangent)
      const tieBuilder = createStrutBuilder();
      // Left arm from (0, -0.32, 0) to (-0.525, 0.06, 0)
      tieBuilder.addStrut(0, -0.32, 0, -HALF_GAUGE, 0.06, 0, 0.075, 0.09);
      // Right arm from (0, -0.32, 0) to (+0.525, 0.06, 0)
      tieBuilder.addStrut(0, -0.32, 0, +HALF_GAUGE, 0.06, 0, 0.075, 0.09);
      // Center collar around spine
      tieBuilder.addBox(0, -0.33, 0, 0.34, 0.16, 0.14, 0);
      const steelTieGeom = tieBuilder.buildGeometry();

      const tieStep = 2; // every 1.0m
      const tieCount = Math.floor(M / tieStep);
      const tieInst = new THREE.InstancedMesh(steelTieGeom, spineMat, tieCount);
      tieInst.castShadow = true;
      let idx = 0;
      for (let i = 0; i < M && idx < tieCount; i += tieStep) {
        const pt = pts[i];
        rotMat.makeBasis(pt.binormal, pt.normal, pt.tangent);
        rotMat.setPosition(pt.pos);
        tieInst.setMatrixAt(idx++, rotMat);
      }
      tieInst.instanceMatrix.needsUpdate = true;
      group.add(tieInst);

    } else if (coaster.type === 'wood') {
      // OLD PINEWOOD: Stacked timber ledger rails + dense wooden sleepers every 0.5m
      const ledgerProfile = makeRectProfile(0.095, 0.11);
      const timberMat = makeMat(coaster.colorPrimary); // 0xb57c4a
      const darkTimberMat = makeMat(P.TIMBER_MID);

      const leftLedgerGeom = buildClosedExtrudedRail(pts, -HALF_GAUGE, -0.09, ledgerProfile);
      const rightLedgerGeom = buildClosedExtrudedRail(pts, +HALF_GAUGE, -0.09, ledgerProfile);
      const leftLedger = new THREE.Mesh(leftLedgerGeom, timberMat);
      const rightLedger = new THREE.Mesh(rightLedgerGeom, timberMat);
      leftLedger.castShadow = true;
      rightLedger.castShadow = true;
      group.add(leftLedger, rightLedger);

      // Outer wooden safety walk / chord rails
      const chordProfile = makeRectProfile(0.06, 0.05);
      const leftChord = new THREE.Mesh(
        buildClosedExtrudedRail(pts, -0.78, -0.06, chordProfile),
        darkTimberMat
      );
      const rightChord = new THREE.Mesh(
        buildClosedExtrudedRail(pts, +0.78, -0.06, chordProfile),
        darkTimberMat
      );
      group.add(leftChord, rightChord);

      // Dense wooden ties every 0.5m (every point)
      const woodTieGeom = new THREE.BoxGeometry(1.72, 0.09, 0.17);
      const tieInst = new THREE.InstancedMesh(woodTieGeom, darkTimberMat, M);
      tieInst.castShadow = true;
      tieInst.receiveShadow = true;
      const pTmp = new THREE.Vector3();
      for (let i = 0; i < M; i++) {
        const pt = pts[i];
        pTmp.copy(pt.pos).addScaledVector(pt.normal, -0.01);
        rotMat.makeBasis(pt.binormal, pt.normal, pt.tangent);
        rotMat.setPosition(pTmp);
        tieInst.setMatrixAt(i, rotMat);
      }
      tieInst.instanceMatrix.needsUpdate = true;
      group.add(tieInst);

      // White/cream wooden handrail catwalks along the lift hill & crest
      const liftPts = pts.filter(p => p.segmentType === 'lift');
      if (liftPts.length >= 4) {
        const creamMat = makeMat(P.CREAM);
        const railR = makeRectProfile(0.035, 0.045);
        // Top & mid handrails on both sides of lift hill
        const topHandL = buildOpenExtrudedSegment(liftPts, -0.86, 0.78, railR);
        const midHandL = buildOpenExtrudedSegment(liftPts, -0.86, 0.42, railR);
        const topHandR = buildOpenExtrudedSegment(liftPts, +0.86, 0.78, railR);
        const midHandR = buildOpenExtrudedSegment(liftPts, +0.86, 0.42, railR);
        if (topHandL) group.add(new THREE.Mesh(topHandL, creamMat));
        if (midHandL) group.add(new THREE.Mesh(midHandL, creamMat));
        if (topHandR) group.add(new THREE.Mesh(topHandR, creamMat));
        if (midHandR) group.add(new THREE.Mesh(midHandR, creamMat));

        // Vertical handrail posts along lift hill every 1.5m
        const postBuilder = createStrutBuilder();
        for (let i = 0; i < liftPts.length; i += 3) {
          const pt = liftPts[i];
          for (let side = -1; side <= 1; side += 2) {
            const bx = pt.pos.x + pt.binormal.x * (0.86 * side);
            const by = pt.pos.y + pt.binormal.y * (0.86 * side);
            const bz = pt.pos.z + pt.binormal.z * (0.86 * side);
            postBuilder.addStrut(
              bx - pt.normal.x * 0.05, by - pt.normal.y * 0.05, bz - pt.normal.z * 0.05,
              bx + pt.normal.x * 0.82, by + pt.normal.y * 0.82, bz + pt.normal.z * 0.82,
              0.055, 0.055
            );
          }
        }
        const postGeom = postBuilder.buildGeometry();
        if (postGeom) group.add(new THREE.Mesh(postGeom, creamMat));
      }

    } else {
      // EMBER MINE RUN: Rusty iron rails on thick rough-hewn timber mine ties + timber trestle stringers
      const stringerProfile = makeRectProfile(0.085, 0.11);
      const darkTimberMat = makeMat(P.TIMBER_DARK);
      const midTimberMat = makeMat(coaster.colorSecondary);

      const leftStringer = new THREE.Mesh(
        buildClosedExtrudedRail(pts, -0.44, -0.15, stringerProfile),
        darkTimberMat
      );
      const rightStringer = new THREE.Mesh(
        buildClosedExtrudedRail(pts, +0.44, -0.15, stringerProfile),
        darkTimberMat
      );
      leftStringer.castShadow = true;
      rightStringer.castShadow = true;
      group.add(leftStringer, rightStringer);

      // Thick rough-hewn mine sleepers every 0.5m
      const mineTieGeom = new THREE.BoxGeometry(1.52, 0.12, 0.22);
      const tieInst = new THREE.InstancedMesh(mineTieGeom, midTimberMat, M);
      tieInst.castShadow = true;
      tieInst.receiveShadow = true;
      const pTmp = new THREE.Vector3();
      for (let i = 0; i < M; i++) {
        const pt = pts[i];
        pTmp.copy(pt.pos).addScaledVector(pt.normal, -0.02);
        rotMat.makeBasis(pt.binormal, pt.normal, pt.tangent);
        rotMat.setPosition(pTmp);
        tieInst.setMatrixAt(i, rotMat);
      }
      tieInst.instanceMatrix.needsUpdate = true;
      group.add(tieInst);

      // Inside tunnel: timber mine-shaft portal ribs & warm glowing mine lanterns!
      const tunnelTimber = createStrutBuilder();
      const lanternBoxes = createStrutBuilder();
      for (let i = 0; i < M; i += 6) {
        const pt = pts[i];
        if (!pt.inTunnel) continue;
        // Left & right tunnel timber posts and overhead cap beam
        const lx = pt.pos.x - pt.binormal.x * 1.45;
        const ly = pt.pos.y - pt.binormal.y * 1.45;
        const lz = pt.pos.z - pt.binormal.z * 1.45;
        const rx = pt.pos.x + pt.binormal.x * 1.45;
        const ry = pt.pos.y + pt.binormal.y * 1.45;
        const rz = pt.pos.z + pt.binormal.z * 1.45;

        const tlx = lx + pt.normal.x * 2.25;
        const tly = ly + pt.normal.y * 2.25;
        const tlz = lz + pt.normal.z * 2.25;
        const trx = rx + pt.normal.x * 2.25;
        const try_ = ry + pt.normal.y * 2.25;
        const trz = rz + pt.normal.z * 2.25;

        tunnelTimber.addStrut(lx - pt.normal.x * 0.3, ly - pt.normal.y * 0.3, lz - pt.normal.z * 0.3, tlx, tly, tlz, 0.22, 0.22);
        tunnelTimber.addStrut(rx - pt.normal.x * 0.3, ry - pt.normal.y * 0.3, rz - pt.normal.z * 0.3, trx, try_, trz, 0.22, 0.22);
        tunnelTimber.addStrut(tlx, tly, tlz, trx, try_, trz, 0.24, 0.24);

        // Hang a warm lantern on alternating sides
        const side = (i % 12 === 0) ? -1.18 : 1.18;
        const lanX = pt.pos.x + pt.binormal.x * side + pt.normal.x * 1.75;
        const lanY = pt.pos.y + pt.binormal.y * side + pt.normal.y * 1.75;
        const lanZ = pt.pos.z + pt.binormal.z * side + pt.normal.z * 1.75;
        lanternBoxes.addBox(lanX, lanY, lanZ, 0.22, 0.30, 0.22, pt.yaw);
      }
      const tunGeom = tunnelTimber.buildGeometry();
      if (tunGeom) group.add(new THREE.Mesh(tunGeom, darkTimberMat));
      const lanGeom = lanternBoxes.buildGeometry();
      if (lanGeom) {
        const lanGlowMat = makeGlowMat(P.WARM_GLOW, 0.75, 1.0);
        group.add(new THREE.Mesh(lanGeom, lanGlowMat));
      }
    }

    // --------------------------------------------------------------------------
    // C. CHAIN LIFT TROUGH & 55 ANIMATED CHAIN DOGS
    // --------------------------------------------------------------------------
    const liftIndices = [];
    for (let i = 0; i < M; i++) {
      if (pts[i].segmentType === 'lift') {
        liftIndices.push(i);
      }
    }

    let chainDogInst = null;
    let liftSStart = 18.0;
    let liftSEnd = 52.0;

    if (liftIndices.length >= 2) {
      const liftPts = liftIndices.map(idx => pts[idx]);
      liftSStart = liftPts[0].s;
      liftSEnd = liftPts[liftPts.length - 1].s;

      // Extruded central steel chain trough along the lift hill
      const troughProfile = makeRectProfile(0.13, 0.055);
      const troughGeom = buildOpenExtrudedSegment(liftPts, 0.0, 0.02, troughProfile);
      if (troughGeom) {
        const troughMesh = new THREE.Mesh(troughGeom, makeMat(P.STEEL_DARK));
        group.add(troughMesh);
      }

      // Animated chain dogs/links (InstancedMesh of 55 links)
      const dogGeom = new THREE.BoxGeometry(0.11, 0.09, 0.18);
      const dogMat = makeMat(P.BRASS);
      chainDogInst = new THREE.InstancedMesh(dogGeom, dogMat, CHAIN_DOG_COUNT);
      chainDogInst.castShadow = true;
      group.add(chainDogInst);
    }

    // --------------------------------------------------------------------------
    // D. BRAKE FINS & MAGNETIC TRIM PLATES (along 'trim' and 'brake' segments)
    // --------------------------------------------------------------------------
    const brakePts = [];
    for (let i = 0; i < M; i++) {
      if (pts[i].segmentType === 'trim' || pts[i].segmentType === 'brake') {
        brakePts.push(pts[i]);
      }
    }
    if (brakePts.length > 0) {
      const finBuilder = createStrutBuilder();
      for (let i = 0; i < brakePts.length; i++) {
        const pt = brakePts[i];
        // Dual parallel brass/steel caliper fins along track center (±0.15m binormal, +0.07m normal)
        for (let side = -1; side <= 1; side += 2) {
          const fx = pt.pos.x + pt.binormal.x * (0.15 * side) + pt.normal.x * 0.07;
          const fy = pt.pos.y + pt.binormal.y * (0.15 * side) + pt.normal.y * 0.07;
          const fz = pt.pos.z + pt.binormal.z * (0.15 * side) + pt.normal.z * 0.07;
          finBuilder.addStrut(
            fx - pt.tangent.x * 0.21, fy - pt.tangent.y * 0.21, fz - pt.tangent.z * 0.21,
            fx + pt.tangent.x * 0.21, fy + pt.tangent.y * 0.21, fz + pt.tangent.z * 0.21,
            0.04, 0.11
          );
        }
      }
      const finGeom = finBuilder.buildGeometry();
      if (finGeom) {
        const finMesh = new THREE.Mesh(finGeom, makeMat(P.BRASS));
        group.add(finMesh);
      }
    }

    // --------------------------------------------------------------------------
    // E. STRUCTURAL SUPPORTS DOWN TO GROUND
    // --------------------------------------------------------------------------
    buildCoasterSupports(coaster, group);

    // Function to update the 55 moving chain dogs along the lift hill
    const tmpPos = new THREE.Vector3();
    const tmpMat = new THREE.Matrix4();
    function updateChainDogs(chainOffset) {
      if (!chainDogInst) return;
      const span = Math.max(1.0, liftSEnd - liftSStart);
      for (let i = 0; i < CHAIN_DOG_COUNT; i++) {
        const u = ((i / CHAIN_DOG_COUNT) * span + chainOffset) % span;
        const s = liftSStart + u;
        const smp = coaster.sampleAt(s);
        tmpPos.copy(smp.pos).addScaledVector(smp.normal, 0.085);
        tmpMat.makeBasis(smp.binormal, smp.normal, smp.tangent);
        tmpMat.setPosition(tmpPos);
        chainDogInst.setMatrixAt(i, tmpMat);
      }
      chainDogInst.instanceMatrix.needsUpdate = true;
    }

    updateChainDogs(0);

    return {
      group,
      coaster,
      updateChainDogs
    };
  }

  /**
   * Builds coaster-specific structural supports down to CPE.WORLD.getGroundY(x, z),
   * skipping station & tunnel points, and widening into A-frame portals over paths/queues.
   */
  function buildCoasterSupports(coaster, group) {
    const P = getPalette();
    const pts = coaster.points;
    const M = pts.length;

    const primaryBuilder = createStrutBuilder();
    const secondaryBuilder = createStrutBuilder(); // footers / stone piers / cross-braces

    // Spacing in point indices (ds = 0.5m -> 9 = 4.5m for wood/mine, 10 = 5.0m for steel)
    const step = coaster.type === 'steel' ? 10 : 9;
    let prevSupportPt = null;

    for (let i = 0; i < M; i += step) {
      const pt = pts[i];
      const x = pt.pos.x;
      const y = pt.pos.y;
      const z = pt.pos.z;

      // Skip inside the station or inside the rock tunnel
      if (isInsideStationFootprint(x, z) || pt.inTunnel) {
        prevSupportPt = null;
        continue;
      }

      // Skip inverted upper half of vertical loop unless we attach angled loop A-frames
      if (pt.isLoop && pt.normal.y < -0.15 && (i % (step * 2) !== 0)) {
        continue;
      }

      // Determine ground elevation
      const gY = (CPE.WORLD && typeof CPE.WORLD.getGroundY === 'function')
        ? CPE.WORLD.getGroundY(x, z)
        : 0.0;
      const height = y - gY;
      if (height < 0.65) {
        prevSupportPt = null;
        continue;
      }

      const overPath = (CPE.WORLD && typeof CPE.WORLD.isOverPathOrQueue === 'function')
        ? CPE.WORLD.isOverPathOrQueue(x, z)
        : false;

      // Horizontal right vector in world XZ plane aligned with track direction
      const rx = Math.sin(pt.yaw);
      const rz = Math.cos(pt.yaw);
      const fx = Math.cos(pt.yaw);
      const fz = -Math.sin(pt.yaw);

      if (coaster.type === 'wood') {
        // OLD PINEWOOD: Classic wooden timber trestle bents
        const topHalfW = 0.68;
        const botHalfW = overPath
          ? Math.max(2.15, 0.85 + height * 0.08)
          : (0.75 + height * 0.065);

        const topY = y - 0.14;
        const tlx = x - rx * topHalfW, tlz = z - rz * topHalfW;
        const trx = x + rx * topHalfW, trz = z + rz * topHalfW;
        const blx = x - rx * botHalfW, blz = z - rz * botHalfW;
        const brx = x + rx * botHalfW, brz = z + rz * botHalfW;

        // Top horizontal cap beam under stringers
        primaryBuilder.addStrut(tlx - rx * 0.15, topY, tlz - rz * 0.15, trx + rx * 0.15, topY, trz + rz * 0.15, 0.18, 0.18);
        // Two battered vertical/sloped posts
        primaryBuilder.addStrut(tlx, topY, tlz, blx, gY, blz, 0.17, 0.17);
        primaryBuilder.addStrut(trx, topY, trz, brx, gY, brz, 0.17, 0.17);

        // Concrete/stone footers
        secondaryBuilder.addBox(blx, gY + 0.18, blz, 0.42, 0.36, 0.42, pt.yaw);
        secondaryBuilder.addBox(brx, gY + 0.18, brz, 0.42, 0.36, 0.42, pt.yaw);

        // Horizontal ledger beams & X-bracing every 3.4m vertically
        const minClearY = overPath ? (gY + 2.85) : (gY + 0.4);
        const bayH = 3.3;
        const numBays = Math.max(1, Math.floor((topY - minClearY) / bayH));

        for (let b = 0; b < numBays; b++) {
          const yA = topY - b * ((topY - minClearY) / numBays);
          const yB = topY - (b + 1) * ((topY - minClearY) / numBays);
          const tA = (topY - yA) / Math.max(0.1, topY - gY);
          const tB = (topY - yB) / Math.max(0.1, topY - gY);

          const wA = topHalfW + (botHalfW - topHalfW) * tA;
          const wB = topHalfW + (botHalfW - topHalfW) * tB;

          const alx = x - rx * wA, alz = z - rz * wA;
          const arx = x + rx * wA, arz = z + rz * wA;
          const blx2 = x - rx * wB, blz2 = z - rz * wB;
          const brx2 = x + rx * wB, brz2 = z + rz * wB;

          // Horizontal crossbeam at yB
          primaryBuilder.addStrut(blx2, yB, blz2, brx2, yB, brz2, 0.12, 0.12);
          // X-brace diagonals
          secondaryBuilder.addStrut(alx, yA, alz, brx2, yB, brz2, 0.085, 0.085);
          secondaryBuilder.addStrut(arx, yA, arz, blx2, yB, blz2, 0.085, 0.085);
        }

        // Longitudinal chord braces between adjacent tall bents
        if (prevSupportPt && height > 6.5 && prevSupportPt.pos.distanceTo(pt.pos) < 7.0) {
          const midY = Math.max(gY + 3.2, y - 3.0);
          if (midY < prevSupportPt.pos.y - 0.5) {
            secondaryBuilder.addStrut(
              prevSupportPt.pos.x - prevSupportPt.rx * 0.9, midY, prevSupportPt.pos.z - prevSupportPt.rz * 0.9,
              x - rx * 0.9, midY, z - rz * 0.9,
              0.09, 0.09
            );
            secondaryBuilder.addStrut(
              prevSupportPt.pos.x + prevSupportPt.rx * 0.9, midY, prevSupportPt.pos.z + prevSupportPt.rz * 0.9,
              x + rx * 0.9, midY, z + rz * 0.9,
              0.09, 0.09
            );
          }
        }
        prevSupportPt = { pos: pt.pos, rx, rz };

      } else if (coaster.type === 'steel') {
        // CINDERLOOP: Sleek dark-steel tubular columns with A-frames on tall sections / loop / path portals
        const spineX = x - pt.normal.x * 0.35;
        const spineY = y - pt.normal.y * 0.35;
        const spineZ = z - pt.normal.z * 0.35;

        if (overPath || pt.isLoop || height > 9.5) {
          // A-Frame twin-leg support straddling path or bracing high-G loop/turns
          const spread = overPath ? 2.25 : Math.min(2.6, 0.9 + height * 0.09);
          const blx = spineX - rx * spread;
          const blz = spineZ - rz * spread;
          const brx = spineX + rx * spread;
          const brz = spineZ + rz * spread;

          primaryBuilder.addStrut(spineX, spineY, spineZ, blx, gY, blz, 0.20, 0.20);
          primaryBuilder.addStrut(spineX, spineY, spineZ, brx, gY, brz, 0.20, 0.20);

          // Horizontal tie bar across the A-frame
          const tieY = overPath ? (gY + 3.0) : (gY + height * 0.48);
          if (tieY < spineY - 1.2) {
            const frac = (spineY - tieY) / Math.max(0.1, spineY - gY);
            const hw = spread * frac;
            primaryBuilder.addStrut(
              spineX - rx * hw, tieY, spineZ - rz * hw,
              spineX + rx * hw, tieY, spineZ + rz * hw,
              0.14, 0.14
            );
          }

          secondaryBuilder.addBox(blx, gY + 0.22, blz, 0.50, 0.44, 0.50, pt.yaw);
          secondaryBuilder.addBox(brx, gY + 0.22, brz, 0.50, 0.44, 0.50, pt.yaw);
        } else {
          // Single heavy tubular column with angled head yoke to the spine
          const colTopY = Math.max(gY + 0.4, spineY - 0.55);
          primaryBuilder.addStrut(spineX, spineY, spineZ, spineX, colTopY, spineZ, 0.20, 0.20);
          primaryBuilder.addStrut(spineX, colTopY, spineZ, spineX, gY, spineZ, 0.24, 0.24);
          secondaryBuilder.addBox(spineX, gY + 0.22, spineZ, 0.54, 0.44, 0.54, pt.yaw);
        }

      } else {
        // EMBER MINE RUN: Rough stone masonry piers near ground topped with heavy timber trestle bents
        const topHalfW = 0.58;
        const botHalfW = overPath ? 2.15 : (0.72 + height * 0.055);
        const topY = y - 0.16;

        const pierH = overPath ? 0.45 : Math.min(2.1, height * 0.35);
        const pierTopY = gY + pierH;

        const tlx = x - rx * topHalfW, tlz = z - rz * topHalfW;
        const trx = x + rx * topHalfW, trz = z + rz * topHalfW;
        const blx = x - rx * botHalfW, blz = z - rz * botHalfW;
        const brx = x + rx * botHalfW, brz = z + rz * botHalfW;

        // Top timber cap beam
        primaryBuilder.addStrut(tlx - rx * 0.15, topY, tlz - rz * 0.15, trx + rx * 0.15, topY, trz + rz * 0.15, 0.20, 0.20);
        // Heavy timber trestle posts down to stone piers
        primaryBuilder.addStrut(tlx, topY, tlz, blx, pierTopY, blz, 0.19, 0.19);
        primaryBuilder.addStrut(trx, topY, trz, brx, pierTopY, brz, 0.19, 0.19);

        // Knee braces / crossbeam
        if (topY - pierTopY > 2.2) {
          const braceY = overPath ? Math.max(gY + 2.85, topY - 1.2) : (pierTopY + (topY - pierTopY) * 0.55);
          if (braceY < topY - 0.4) {
            const t = (topY - braceY) / Math.max(0.1, topY - pierTopY);
            const hw = topHalfW + (botHalfW - topHalfW) * t;
            primaryBuilder.addStrut(x - rx * hw, braceY, z - rz * hw, x + rx * hw, braceY, z + rz * hw, 0.14, 0.14);
          }
        }

        // Stone masonry piers at base
        secondaryBuilder.addBox(blx, gY + pierH * 0.5, blz, 0.56, pierH, 0.56, pt.yaw);
        secondaryBuilder.addBox(brx, gY + pierH * 0.5, brz, 0.56, pierH, 0.56, pt.yaw);
      }
    }

    const primGeom = primaryBuilder.buildGeometry();
    if (primGeom) {
      const primMat = makeMat(coaster.colorSupport);
      const primMesh = new THREE.Mesh(primGeom, primMat);
      primMesh.castShadow = true;
      primMesh.receiveShadow = true;
      group.add(primMesh);
    }

    const secGeom = secondaryBuilder.buildGeometry();
    if (secGeom) {
      const secColor = coaster.type === 'wood'
        ? P.TIMBER_LIGHT
        : (coaster.type === 'mine' ? P.PLUM_ROCK_LIGHT : P.COBBLESTONE);
      const secMesh = new THREE.Mesh(secGeom, makeMat(secColor));
      secMesh.castShadow = true;
      secMesh.receiveShadow = true;
      group.add(secMesh);
    }
  }

  // ============================================================================
  // 4. GRAND COASTER STATION (X in [-9.5, 7.5], Z = 14, Y = 2.2)
  // ============================================================================
  function buildGrandStation() {
    const P = getPalette();
    const stationGroup = new THREE.Group();
    stationGroup.name = 'GrandCoasterStation';

    const brickMat = makeMat(P.BRICK_RED);
    const darkBrickMat = makeMat(P.BRICK_DARK);
    const stoneMat = makeMat(P.COBBLESTONE);
    const timberLightMat = makeMat(P.TIMBER_LIGHT);
    const timberMidMat = makeMat(P.TIMBER_MID);
    const timberDarkMat = makeMat(P.TIMBER_DARK);
    const creamMat = makeMat(P.CREAM);
    const cherryMat = makeMat(P.CHERRY_RED);
    const brassMat = makeMat(P.BRASS);
    const slateMat = makeMat(P.SLATE_ROOF);
    const steelDarkMat = makeMat(P.STEEL_DARK);
    const lanternGlowMat = makeGlowMat(P.WARM_GLOW, 0.25, 1.0);

    // Station spans X in [-9.5, 7.5] (length 17.0m, centered at X = -1.0), Z = 14.0
    const stCenterX = -1.0;
    const stLen = 17.0;

    // 1. Raised Brick & Stone Masonry Base under South & North Platforms
    // South Boarding Platform Base (Z in [15.05, 17.65], Y in [0, 1.96])
    const southBase = new THREE.Mesh(new THREE.BoxGeometry(stLen, 1.96, 2.6), brickMat);
    southBase.position.set(stCenterX, 0.98, 16.35);
    southBase.castShadow = true;
    southBase.receiveShadow = true;
    stationGroup.add(southBase);

    // North Exit Platform Base (Z in [10.35, 12.95], Y in [0, 1.96])
    const northBase = new THREE.Mesh(new THREE.BoxGeometry(stLen, 1.96, 2.6), brickMat);
    northBase.position.set(stCenterX, 0.98, 11.65);
    northBase.castShadow = true;
    northBase.receiveShadow = true;
    stationGroup.add(northBase);

    // Central Track Pit Floor (Z in [12.95, 15.05], Y in [0, 1.42]) so track sits cleanly in trough
    const pitBase = new THREE.Mesh(new THREE.BoxGeometry(stLen - 0.2, 1.42, 2.2), darkBrickMat);
    pitBase.position.set(stCenterX, 0.71, 14.0);
    pitBase.receiveShadow = true;
    stationGroup.add(pitBase);

    // Stone Foundation Plinth & Decorative Brick Pilasters around outer walls
    const stonePlinthS = new THREE.Mesh(new THREE.BoxGeometry(stLen + 0.3, 0.38, 2.8), stoneMat);
    stonePlinthS.position.set(stCenterX, 0.19, 16.35);
    const stonePlinthN = new THREE.Mesh(new THREE.BoxGeometry(stLen + 0.3, 0.38, 2.8), stoneMat);
    stonePlinthN.position.set(stCenterX, 0.19, 11.65);
    stationGroup.add(stonePlinthS, stonePlinthN);

    const pilasterBuilder = createStrutBuilder();
    const colXs = [-9.1, -5.85, -2.6, 0.65, 3.9, 7.1];
    for (let i = 0; i < colXs.length; i++) {
      const px = colXs[i];
      pilasterBuilder.addBox(px, 1.0, 17.68, 0.45, 1.96, 0.22, 0);
      pilasterBuilder.addBox(px, 1.0, 10.32, 0.45, 1.96, 0.22, 0);
      if (i < colXs.length - 1) {
        // Recessed dark brick arch panels on South & North walls
        const midX = 0.5 * (colXs[i] + colXs[i + 1]);
        pilasterBuilder.addBox(midX, 1.65, 17.67, 2.5, 0.38, 0.12, 0);
        pilasterBuilder.addBox(midX, 1.65, 10.33, 2.5, 0.38, 0.12, 0);
      }
    }
    stationGroup.add(new THREE.Mesh(pilasterBuilder.buildGeometry(), stoneMat));

    // 2. Timber Boarding & Exit Platform Decks (top surface Y = 2.12)
    const southDeck = new THREE.Mesh(new THREE.BoxGeometry(stLen + 0.2, 0.16, 2.75), timberLightMat);
    southDeck.position.set(stCenterX, 2.04, 16.35);
    southDeck.receiveShadow = true;
    stationGroup.add(southDeck);

    const northDeck = new THREE.Mesh(new THREE.BoxGeometry(stLen + 0.2, 0.16, 2.75), timberLightMat);
    northDeck.position.set(stCenterX, 2.04, 11.65);
    northDeck.receiveShadow = true;
    stationGroup.add(northDeck);

    // Yellow/Brass Safety Tactile Edge Strip along both platform edges bordering the track
    const southSafetyStrip = new THREE.Mesh(new THREE.BoxGeometry(stLen, 0.17, 0.14), brassMat);
    southSafetyStrip.position.set(stCenterX, 2.045, 15.05);
    const northSafetyStrip = new THREE.Mesh(new THREE.BoxGeometry(stLen, 0.17, 0.14), brassMat);
    northSafetyStrip.position.set(stCenterX, 2.045, 12.95);
    stationGroup.add(southSafetyStrip, northSafetyStrip);

    // 3. Boarding Entry Stairs (South-West: X in [-8.6, -5.8], Z = 17.6..20.2)
    // and Exit Stairs (North-West: X in [-8.6, -5.8], Z = 10.4..7.8)
    const stairBuilder = createStrutBuilder();
    const railBuilder = createStrutBuilder();
    const numSteps = 8;
    for (let s = 0; s < numSteps; s++) {
      const frac = (s + 1) / numSteps;
      const stepH = frac * 2.10;
      const zS = 20.1 - frac * 2.4;
      const zN = 7.9 + frac * 2.4;
      stairBuilder.addBox(-7.2, stepH * 0.5, zS, 2.4, stepH, 0.34, 0);
      stairBuilder.addBox(-7.2, stepH * 0.5, zN, 2.4, stepH, 0.34, 0);
    }
    // Stair handrails
    for (let side = -1; side <= 1; side += 2) {
      const sx = -7.2 + side * 1.15;
      railBuilder.addStrut(sx, 0.85, 20.1, sx, 2.95, 17.6, 0.08, 0.08);
      railBuilder.addStrut(sx, 0.0, 20.1, sx, 0.88, 20.1, 0.09, 0.09);
      railBuilder.addStrut(sx, 0.85, 7.9, sx, 2.95, 10.4, 0.08, 0.08);
      railBuilder.addStrut(sx, 0.0, 7.9, sx, 0.88, 7.9, 0.09, 0.09);
    }
    stationGroup.add(new THREE.Mesh(stairBuilder.buildGeometry(), timberMidMat));

    // Perimeter Safety Railing along South back edge (leaving entry stair gap & booth) and North back edge
    // South back edge Z = 17.62
    railBuilder.addStrut(-5.8, 2.92, 17.62, 4.9, 2.92, 17.62, 0.07, 0.07);
    railBuilder.addStrut(-5.8, 2.52, 17.62, 4.9, 2.52, 17.62, 0.05, 0.05);
    for (let rx = -5.8; rx <= 5.0; rx += 1.5) {
      railBuilder.addStrut(rx, 2.12, 17.62, rx, 2.96, 17.62, 0.08, 0.08);
    }
    // North back edge Z = 10.38
    railBuilder.addStrut(-5.8, 2.92, 10.38, 7.3, 2.92, 10.38, 0.07, 0.07);
    railBuilder.addStrut(-5.8, 2.52, 10.38, 7.3, 2.52, 10.38, 0.05, 0.05);
    for (let rx = -5.8; rx <= 7.3; rx += 1.6) {
      railBuilder.addStrut(rx, 2.12, 10.38, rx, 2.96, 10.38, 0.08, 0.08);
    }
    // West & East platform end rails
    railBuilder.addStrut(-9.45, 2.92, 15.15, -9.45, 2.92, 17.62, 0.07, 0.07);
    railBuilder.addStrut(-9.45, 2.92, 10.38, -9.45, 2.92, 12.85, 0.07, 0.07);
    railBuilder.addStrut(7.45, 2.92, 10.38, 7.45, 2.92, 12.85, 0.07, 0.07);
    stationGroup.add(new THREE.Mesh(railBuilder.buildGeometry(), creamMat));

    // 4. Ornate Cast-Iron & Brass Canopy Columns + Victorian Fairground Roof
    const columnBuilder = createStrutBuilder();
    const brassTrimBuilder = createStrutBuilder();

    for (let i = 0; i < colXs.length; i++) {
      const cx = colXs[i];
      for (let side = -1; side <= 1; side += 2) {
        const cz = 14.0 + side * 3.45; // 17.45 and 10.55
        // Column shaft from Y = 2.12 to Y = 5.35
        columnBuilder.addStrut(cx, 2.12, cz, cx, 5.35, cz, 0.16, 0.16);
        // Ornate base & capital collars in brass
        brassTrimBuilder.addBox(cx, 2.28, cz, 0.28, 0.32, 0.28, 0);
        brassTrimBuilder.addBox(cx, 5.20, cz, 0.30, 0.24, 0.30, 0);
        // Curved/angled Victorian corbel brackets supporting roof eaves & trusses
        brassTrimBuilder.addStrut(cx, 4.45, cz, cx, 5.30, cz - side * 0.85, 0.08, 0.08);
        if (i < colXs.length - 1) {
          brassTrimBuilder.addStrut(cx, 4.65, cz, cx + 0.75, 5.30, cz, 0.07, 0.07);
        }
        if (i > 0) {
          brassTrimBuilder.addStrut(cx, 4.65, cz, cx - 0.75, 5.30, cz, 0.07, 0.07);
        }
      }
      // Overhead steel/timber roof truss spanning Z = 10.55 to 17.45
      columnBuilder.addStrut(cx, 5.32, 10.5, cx, 5.32, 17.5, 0.14, 0.14);
      columnBuilder.addStrut(cx, 5.32, 10.5, cx, 6.95, 14.0, 0.13, 0.13);
      columnBuilder.addStrut(cx, 5.32, 17.5, cx, 6.95, 14.0, 0.13, 0.13);
    }
    stationGroup.add(new THREE.Mesh(columnBuilder.buildGeometry(), steelDarkMat));

    // Pitched Victorian Canopy Roof (two sloped planes + raised clerestory cupola)
    const roofLen = stLen + 1.2;
    const southRoofSlope = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.18, 4.3), slateMat);
    southRoofSlope.position.set(stCenterX, 6.08, 15.85);
    southRoofSlope.rotation.x = 0.38;
    southRoofSlope.castShadow = true;
    southRoofSlope.receiveShadow = true;

    const northRoofSlope = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.18, 4.3), slateMat);
    northRoofSlope.position.set(stCenterX, 6.08, 12.15);
    northRoofSlope.rotation.x = -0.38;
    northRoofSlope.castShadow = true;
    northRoofSlope.receiveShadow = true;
    stationGroup.add(southRoofSlope, northRoofSlope);

    // Central Clerestory Monitor & Clock Cupola at X = -1.0, Z = 14.0
    const clerestoryBase = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.75, 2.1), creamMat);
    clerestoryBase.position.set(stCenterX, 6.95, 14.0);
    const clerestoryCap = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.24, 2.5), cherryMat);
    clerestoryCap.position.set(stCenterX, 7.42, 14.0);
    const cupolaTower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.15, 2.2), creamMat);
    cupolaTower.position.set(stCenterX, 7.85, 14.0);
    const cupolaRoof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.35, 4), cherryMat);
    cupolaRoof.position.set(stCenterX, 9.05, 14.0);
    cupolaRoof.rotation.y = Math.PI * 0.25;
    stationGroup.add(clerestoryBase, clerestoryCap, cupolaTower, cupolaRoof);

    // Glowing Clock Face & Finial Spire on Cupola
    const clockFaceS = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), lanternGlowMat);
    clockFaceS.rotation.x = Math.PI * 0.5;
    clockFaceS.position.set(stCenterX, 7.9, 15.12);
    const clockFaceN = clockFaceS.clone();
    clockFaceN.position.set(stCenterX, 7.9, 12.88);
    stationGroup.add(clockFaceS, clockFaceN);
    brassTrimBuilder.addStrut(stCenterX, 9.6, 14.0, stCenterX, 10.65, 14.0, 0.07, 0.07);
    brassTrimBuilder.addBox(stCenterX, 10.35, 14.0, 0.55, 0.14, 0.06, 0);

    // Scalloped Fairground Valance Trim (Alternating Cherry Red & Cream teeth along eaves)
    const valanceRedBuilder = createStrutBuilder();
    const valanceCreamBuilder = createStrutBuilder();
    const numScallops = 36;
    const scWidth = roofLen / numScallops;
    for (let i = 0; i < numScallops; i++) {
      const sx = (stCenterX - roofLen * 0.5) + (i + 0.5) * scWidth;
      const target = (i % 2 === 0) ? valanceRedBuilder : valanceCreamBuilder;
      target.addBox(sx, 5.18, 17.82, scWidth * 0.96, 0.34, 0.08, 0);
      target.addBox(sx, 5.18, 10.18, scWidth * 0.96, 0.34, 0.08, 0);
    }
    stationGroup.add(new THREE.Mesh(valanceRedBuilder.buildGeometry(), cherryMat));
    stationGroup.add(new THREE.Mesh(valanceCreamBuilder.buildGeometry(), creamMat));

    // Ornate Station Signboard on South Facade ("CINDERPINE EXPRESS")
    const signBack = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.88, 0.18), timberDarkMat);
    signBack.position.set(stCenterX, 5.82, 17.85);
    const signFace = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.64, 0.22), creamMat);
    signFace.position.set(stCenterX, 5.82, 17.87);
    brassTrimBuilder.addBox(stCenterX, 5.82, 17.84, 7.0, 1.02, 0.12, 0);
    stationGroup.add(signBack, signFace);

    // 5. Warm Hanging Station Lanterns (registered with CPE.registerGlowMaterial)
    const lanternHousings = createStrutBuilder();
    const lanternGlobes = createStrutBuilder();
    for (let i = 0; i < colXs.length - 1; i++) {
      const lx = 0.5 * (colXs[i] + colXs[i + 1]);
      for (let side = -1; side <= 1; side += 2) {
        const lz = 14.0 + side * 2.55;
        // Hanging chain/rod from truss at Y = 5.32 down to lantern at Y = 4.35
        lanternHousings.addStrut(lx, 4.50, lz, lx, 5.32, lz, 0.04, 0.04);
        lanternHousings.addBox(lx, 4.48, lz, 0.30, 0.08, 0.30, 0);
        lanternHousings.addBox(lx, 4.08, lz, 0.24, 0.06, 0.24, 0);
        lanternGlobes.addBox(lx, 4.28, lz, 0.22, 0.32, 0.22, 0);
      }
    }
    stationGroup.add(new THREE.Mesh(lanternHousings.buildGeometry(), steelDarkMat));
    stationGroup.add(new THREE.Mesh(lanternGlobes.buildGeometry(), lanternGlowMat));

    // 6. Animated Air-Gates (5 Boarding Gates on South Platform at Z = 15.18)
    // Aligned with the 5 cars: X = 3.9, 1.45, -1.0, -3.45, -5.9
    const carGateXs = [3.9, 1.45, -1.0, -3.45, -5.9];
    const gateFenceBuilder = createStrutBuilder();
    const gateLeaves = []; // { leftPivot, rightPivot }

    const gateZ = 15.18;
    const gateHalfOpening = 0.62;

    for (let c = 0; c < carGateXs.length; c++) {
      const gx = carGateXs[c];
      // Hinge posts at gx - gateHalfOpening and gx + gateHalfOpening
      gateFenceBuilder.addBox(gx - gateHalfOpening, 2.58, gateZ, 0.11, 0.92, 0.11, 0);
      gateFenceBuilder.addBox(gx + gateHalfOpening, 2.58, gateZ, 0.11, 0.92, 0.11, 0);
      brassTrimBuilder.addBox(gx - gateHalfOpening, 3.06, gateZ, 0.14, 0.08, 0.14, 0);
      brassTrimBuilder.addBox(gx + gateHalfOpening, 3.06, gateZ, 0.14, 0.08, 0.14, 0);

      // Fixed railing panel between car c and car c+1
      if (c < carGateXs.length - 1) {
        const nextGx = carGateXs[c + 1];
        const xA = nextGx + gateHalfOpening;
        const xB = gx - gateHalfOpening;
        gateFenceBuilder.addStrut(xA, 2.92, gateZ, xB, 2.92, gateZ, 0.06, 0.06);
        gateFenceBuilder.addStrut(xA, 2.38, gateZ, xB, 2.38, gateZ, 0.06, 0.06);
        for (let px = xA + 0.25; px < xB - 0.1; px += 0.28) {
          gateFenceBuilder.addStrut(px, 2.38, gateZ, px, 2.92, gateZ, 0.04, 0.04);
        }
      }

      // Left & Right animated swinging gate leaves
      const leftPivot = new THREE.Group();
      leftPivot.position.set(gx - gateHalfOpening + 0.04, 2.58, gateZ);
      const leftLeafGeom = createStrutBuilder();
      leftLeafGeom.addBox(0.26, 0.28, 0, 0.52, 0.05, 0.05, 0);
      leftLeafGeom.addBox(0.26, -0.22, 0, 0.52, 0.05, 0.05, 0);
      leftLeafGeom.addBox(0.14, 0.03, 0, 0.04, 0.48, 0.04, 0);
      leftLeafGeom.addBox(0.32, 0.03, 0, 0.04, 0.48, 0.04, 0);
      leftLeafGeom.addBox(0.49, 0.03, 0, 0.05, 0.52, 0.05, 0);
      leftPivot.add(new THREE.Mesh(leftLeafGeom.buildGeometry(), brassMat));
      stationGroup.add(leftPivot);

      const rightPivot = new THREE.Group();
      rightPivot.position.set(gx + gateHalfOpening - 0.04, 2.58, gateZ);
      const rightLeafGeom = createStrutBuilder();
      rightLeafGeom.addBox(-0.26, 0.28, 0, 0.52, 0.05, 0.05, 0);
      rightLeafGeom.addBox(-0.26, -0.22, 0, 0.52, 0.05, 0.05, 0);
      rightLeafGeom.addBox(-0.14, 0.03, 0, 0.04, 0.48, 0.04, 0);
      rightLeafGeom.addBox(-0.32, 0.03, 0, 0.04, 0.48, 0.04, 0);
      rightLeafGeom.addBox(-0.49, 0.03, 0, 0.05, 0.52, 0.05, 0);
      rightPivot.add(new THREE.Mesh(rightLeafGeom.buildGeometry(), brassMat));
      stationGroup.add(rightPivot);

      gateLeaves.push({ leftPivot, rightPivot });
    }
    stationGroup.add(new THREE.Mesh(gateFenceBuilder.buildGeometry(), steelDarkMat));

    // 7. Operator Control Booth (X = 6.2, Z = 16.2, Y = 2.12) with Dispatch Lever & Station Bell
    const boothGroup = new THREE.Group();
    boothGroup.position.set(6.2, 2.12, 16.25);

    const deskBody = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.96, 0.95), timberDarkMat);
    deskBody.position.set(0, 0.48, 0);
    deskBody.castShadow = true;
    const deskTrim = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.10, 1.02), brassMat);
    deskTrim.position.set(0, 0.96, 0);
    const consoleSlope = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.22, 0.65), steelDarkMat);
    consoleSlope.position.set(0, 1.06, -0.08);
    consoleSlope.rotation.x = -0.25;
    boothGroup.add(deskBody, deskTrim, consoleSlope);

    // Status Indicator Buttons on Control Panel
    const greenBtn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), makeGlowMat(0x52d669, 0.6, 1.0));
    greenBtn.position.set(-0.35, 1.16, -0.10);
    const amberBtn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), makeGlowMat(P.GOLD, 0.5, 0.95));
    amberBtn.position.set(-0.10, 1.16, -0.10);
    const redBtn = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), makeGlowMat(P.CHERRY_RED, 0.5, 0.95));
    redBtn.position.set(0.15, 1.16, -0.10);
    boothGroup.add(greenBtn, amberBtn, redBtn);

    // Animated Dispatch Lever
    const leverPivot = new THREE.Group();
    leverPivot.position.set(0.44, 1.12, -0.08);
    const leverShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), brassMat);
    leverShaft.position.set(0, 0.21, 0);
    const leverGrip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), cherryMat);
    leverGrip.position.set(0, 0.43, 0);
    leverPivot.add(leverShaft, leverGrip);
    boothGroup.add(leverPivot);

    // Station Bell mounted on an ornate bracket above the control booth
    const bellPost = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.85, 0.10), steelDarkMat);
    bellPost.position.set(0.58, 0.92, -0.35);
    const bellArm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), brassMat);
    bellArm.position.set(0.38, 1.80, -0.35);
    boothGroup.add(bellPost, bellArm);

    const bellPivot = new THREE.Group();
    bellPivot.position.set(0.24, 1.78, -0.35);
    const bellCone = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.26, 8), brassMat);
    bellCone.position.set(0, -0.14, 0);
    const bellCrown = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), brassMat);
    bellCrown.position.set(0, -0.03, 0);
    bellPivot.add(bellCone, bellCrown);
    boothGroup.add(bellPivot);

    stationGroup.add(boothGroup);
    stationGroup.add(new THREE.Mesh(brassTrimBuilder.buildGeometry(), brassMat));

    return {
      group: stationGroup,
      gateLeaves,
      leverPivot,
      bellPivot
    };
  }

  // ============================================================================
  // 5. 5-CAR ARTICULATED TRAIN WITH 20 RIDERS & HEADLAMP
  // ============================================================================
  const RIDER_JACKET_COLORS = [
    0xd9383a, // cherry red
    0xe59f28, // foliage gold
    0x367a82, // steel teal
    0xd65f24, // autumn orange
    0x6e4f63, // plum
    0x5a6332, // moss olive
    0xf4e9d1, // cream sweater
    0x9e3b2b, // brick crimson
    0x3b4254, // slate navy
    0xb57c4a  // camel coat
  ];

  const RIDER_SKIN_COLORS = [
    0xf5cfa6,
    0xe3b488,
    0xc99268,
    0x8f5d3c,
    0xf7dcc0
  ];

  const RIDER_HAIR_COLORS = [
    0x3b2416,
    0x1e1815,
    0x8c4221,
    0xd9a33c,
    0x59361e,
    0x9e3b2b
  ];

  function createRiderMesh(riderIndex) {
    const P = getPalette();
    const root = new THREE.Group();

    const jacketHex = RIDER_JACKET_COLORS[riderIndex % RIDER_JACKET_COLORS.length];
    const skinHex = RIDER_SKIN_COLORS[riderIndex % RIDER_SKIN_COLORS.length];
    const hairHex = RIDER_HAIR_COLORS[(riderIndex * 3) % RIDER_HAIR_COLORS.length];

    const jacketMat = makeMat(jacketHex);
    const skinMat = makeMat(skinHex);
    const hairMat = makeMat(hairHex);

    // Upper body pivot at hip (allows leaning with G-forces)
    const upperBody = new THREE.Group();
    upperBody.position.set(0, 0.36, 0);
    root.add(upperBody);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.20), jacketMat);
    torso.position.set(0, 0.17, 0);
    torso.castShadow = true;
    upperBody.add(torso);

    // Optional autumn scarf on every 3rd rider
    if (riderIndex % 3 === 0) {
      const scarfColor = (riderIndex % 2 === 0) ? P.CREAM : P.GOLD;
      const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.07, 0.22), makeMat(scarfColor));
      scarf.position.set(0, 0.33, 0.01);
      upperBody.add(scarf);
    }

    // Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.37, 0);
    upperBody.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.22, 0.21), skinMat);
    head.position.set(0, 0.11, 0);
    head.castShadow = true;
    headGroup.add(head);

    // Varied Hair / Hats (0: cap, 1: pom-pom beanie, 2: bushy hair, 3: bowler hat)
    const style = riderIndex % 4;
    if (style === 0) {
      // Hair back + Baseball/Flat Cap
      const capMat = makeMat(RIDER_JACKET_COLORS[(riderIndex + 4) % RIDER_JACKET_COLORS.length]);
      const capCrown = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 0.23), capMat);
      capCrown.position.set(0, 0.21, 0);
      const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.09), capMat);
      capVisor.position.set(0, 0.18, 0.14);
      headGroup.add(capCrown, capVisor);
    } else if (style === 1) {
      // Knit Autumn Beanie with pom-pom
      const beanieMat = makeMat(RIDER_JACKET_COLORS[(riderIndex + 2) % RIDER_JACKET_COLORS.length]);
      const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.11, 0.23), beanieMat);
      beanie.position.set(0, 0.22, 0);
      const pom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), makeMat(P.CREAM));
      pom.position.set(0, 0.30, 0);
      headGroup.add(beanie, pom);
    } else if (style === 2) {
      // Full hair + ponytail/bun
      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 0.23), hairMat);
      hairTop.position.set(0, 0.21, -0.01);
      const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.07), hairMat);
      hairBack.position.set(0, 0.13, -0.10);
      headGroup.add(hairTop, hairBack);
    } else {
      // Vintage Fairground Bowler / Top Hat
      const hatMat = makeMat(P.STEEL_DARK);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.03, 0.29), hatMat);
      brim.position.set(0, 0.20, 0);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.13, 0.20), hatMat);
      crown.position.set(0, 0.27, 0);
      headGroup.add(brim, crown);
    }

    // Left & Right Arm Pivots at Shoulders
    // Remember: in Car Local Space, +Z is forward!
    // When arm hangs straight down along -Y, rotating around X by -PI/2 points the arm forward (+Z),
    // and rotating around X by -PI points the arm straight UP (+Y)!
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(0.18, 0.29, 0);
    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.085), jacketMat);
    leftSleeve.position.set(0, -0.11, 0);
    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.075), skinMat);
    leftHand.position.set(0, -0.26, 0);
    leftArmPivot.add(leftSleeve, leftHand);
    upperBody.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(-0.18, 0.29, 0);
    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.085), jacketMat);
    rightSleeve.position.set(0, -0.11, 0);
    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.075), skinMat);
    rightHand.position.set(0, -0.26, 0);
    rightArmPivot.add(rightSleeve, rightHand);
    upperBody.add(rightArmPivot);

    return {
      root,
      upperBody,
      headGroup,
      leftArmPivot,
      rightArmPivot,
      riderIndex
    };
  }

  function buildTrain() {
    const P = getPalette();
    const trainGroup = new THREE.Group();
    trainGroup.name = 'CoasterTrain';

    // Dynamic customizable materials shared across the 5 cars so switching coasters updates car colors immediately
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd9383a, flatShading: true });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xf4e9d1, flatShading: true });
    const chassisMat = makeMat(P.STEEL_DARK);
    const brassMat = makeMat(P.BRASS);
    const seatMat = makeMat(P.BRICK_DARK);
    const headlampLensMat = makeGlowMat(P.WARM_GLOW, 0.35, 1.0);

    const carObjects = [];
    const allRiders = [];
    const restraintPivots = [];
    const frontRowRiders = []; // Car 0, Row 0 riders to hide in First-Person mode
    const styleProps = { wood: [], steel: [], mine: [] };

    for (let c = 0; c < 5; c++) {
      const isFrontCar = (c === 0);
      const carRoot = new THREE.Group();
      carRoot.matrixAutoUpdate = false;
      trainGroup.add(carRoot);

      // Visual suspension/roll group inside carRoot
      const carBody = new THREE.Group();
      carRoot.add(carBody);

      // 1. Heavy Undercarriage Chassis & 4 Wheel Bogies hugging the rails (±0.525m X, +0.08m Y)
      const chassisBuilder = createStrutBuilder();
      const bogieWheelBuilder = createStrutBuilder();

      // Main floor frame
      chassisBuilder.addBox(0, 0.16, -0.05, 1.14, 0.14, 1.98, 0);
      // Front & rear axle crossbeams
      chassisBuilder.addBox(0, 0.10, 0.68, 1.24, 0.10, 0.22, 0);
      chassisBuilder.addBox(0, 0.10, -0.74, 1.24, 0.10, 0.22, 0);
      // Rear coupling hitch tongue
      if (c < 4) {
        chassisBuilder.addStrut(0, 0.14, -0.95, 0, 0.14, -1.52, 0.12, 0.08);
      }

      // 4 Wheel Bogie Assemblies (top road wheel, bottom upstop wheel, side guide wheel)
      const bogieZs = [0.68, -0.74];
      for (let bz = 0; bz < bogieZs.length; bz++) {
        const zPos = bogieZs[bz];
        for (let side = -1; side <= 1; side += 2) {
          const xPos = side * HALF_GAUGE;
          // Bogie yoke bracket
          chassisBuilder.addBox(xPos, 0.10, zPos, 0.20, 0.22, 0.34, 0);
          // Road wheel above rail
          bogieWheelBuilder.addBox(xPos, 0.17, zPos, 0.08, 0.14, 0.22, 0);
          // Upstop wheel below rail
          bogieWheelBuilder.addBox(xPos, 0.00, zPos, 0.07, 0.10, 0.16, 0);
        }
      }
      carBody.add(new THREE.Mesh(chassisBuilder.buildGeometry(), chassisMat));
      carBody.add(new THREE.Mesh(bogieWheelBuilder.buildGeometry(), brassMat));

      // 2. Sculpted Car Body Shell (Low Sculpted Nose on Car 0 so First-Person view is crystal clear!)
      const bodyBuilder = createStrutBuilder();
      const trimBuilder = createStrutBuilder();

      // Left & Right side Tub Walls (z from -0.96 to +0.68)
      bodyBuilder.addBox(-0.55, 0.44, -0.12, 0.11, 0.44, 1.68, 0);
      bodyBuilder.addBox(+0.55, 0.44, -0.12, 0.11, 0.44, 1.68, 0);
      // Trim stripe along side walls
      trimBuilder.addBox(-0.57, 0.50, -0.12, 0.12, 0.10, 1.70, 0);
      trimBuilder.addBox(+0.57, 0.50, -0.12, 0.12, 0.10, 1.70, 0);
      // Top armrest coaming
      trimBuilder.addBox(-0.55, 0.67, -0.12, 0.14, 0.05, 1.68, 0);
      trimBuilder.addBox(+0.55, 0.67, -0.12, 0.14, 0.05, 1.68, 0);

      // Rear Backrest Bulkhead
      bodyBuilder.addBox(0, 0.48, -0.92, 1.18, 0.52, 0.14, 0);
      trimBuilder.addBox(0, 0.75, -0.92, 1.16, 0.06, 0.16, 0);

      // Middle Divider Bench Backrest (between Row 0 and Row 1 at z = -0.12)
      bodyBuilder.addBox(0, 0.44, -0.12, 1.04, 0.40, 0.10, 0);

      if (isFrontCar) {
        // CAR 0: Low Sculpted Nose Cone (z from +0.68 to +1.28, max height y = 0.54m!)
        // Stepped/tapered low hood so front-seat camera at y ≈ 0.98m looks right over it onto the rails!
        bodyBuilder.addBox(0, 0.37, 0.84, 1.12, 0.32, 0.36, 0);
        bodyBuilder.addBox(0, 0.33, 1.08, 0.92, 0.24, 0.26, 0);
        bodyBuilder.addBox(0, 0.28, 1.24, 0.68, 0.16, 0.16, 0);
        trimBuilder.addBox(0, 0.48, 0.88, 0.96, 0.07, 0.38, 0);
        trimBuilder.addBox(0, 0.40, 1.12, 0.72, 0.06, 0.24, 0);
      } else {
        // Cars 1..4: Standard low front cowling
        bodyBuilder.addBox(0, 0.42, 0.72, 1.14, 0.38, 0.16, 0);
        trimBuilder.addBox(0, 0.62, 0.72, 1.16, 0.06, 0.18, 0);
      }

      const bodyMesh = new THREE.Mesh(bodyBuilder.buildGeometry(), bodyMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      const trimMesh = new THREE.Mesh(trimBuilder.buildGeometry(), trimMat);
      trimMesh.castShadow = true;
      carBody.add(bodyMesh, trimMesh);

      // Coaster-specific nose accent on Car 0
      if (isFrontCar) {
        // Mine Train low-profile brass-banded boiler barrel & stubby funnel (kept below y = 0.58m!)
        const mineAccent = new THREE.Group();
        const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.52, 8), chassisMat);
        boiler.rotation.x = Math.PI * 0.5;
        boiler.position.set(0, 0.36, 0.96);
        const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.05, 8), brassMat);
        band1.rotation.x = Math.PI * 0.5;
        band1.position.set(0, 0.36, 0.82);
        const band2 = band1.clone();
        band2.position.set(0, 0.36, 1.10);
        const cowcatcher = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 4), brassMat);
        cowcatcher.rotation.x = Math.PI * 0.5;
        cowcatcher.rotation.y = Math.PI * 0.25;
        cowcatcher.position.set(0, 0.20, 1.32);
        mineAccent.add(boiler, band1, band2, cowcatcher);
        carBody.add(mineAccent);
        styleProps.mine.push(mineAccent);

        // Wood Coaster vintage brass radiator grille
        const woodAccent = new THREE.Group();
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.24, 0.08), brassMat);
        grille.position.set(0, 0.34, 1.28);
        woodAccent.add(grille);
        carBody.add(woodAccent);
        styleProps.wood.push(woodAccent);

        // Steel Coaster sleek nose fin
        const steelAccent = new THREE.Group();
        const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.36, 4), trimMat);
        noseCone.rotation.x = Math.PI * 0.5;
        noseCone.rotation.y = Math.PI * 0.25;
        noseCone.position.set(0, 0.31, 1.34);
        steelAccent.add(noseCone);
        carBody.add(steelAccent);
        styleProps.steel.push(steelAccent);

        // 3. Front Headlamp Housing & Glowing Lens on Car 0
        const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 8), brassMat);
        lampHousing.rotation.x = Math.PI * 0.5;
        lampHousing.position.set(0, 0.42, 1.28);
        const lampLens = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.05, 8), headlampLensMat);
        lampLens.rotation.x = Math.PI * 0.5;
        lampLens.position.set(0, 0.42, 1.35);
        carBody.add(lampHousing, lampLens);
      }

      // 4. Seats, Lap-Bar Restraints & 4 Riders per Car (2 rows × 2 seats)
      // Row 0 (front row): z = +0.28, Row 1 (back row): z = -0.52
      const rowZs = [0.28, -0.52];
      const seatXs = [-0.25, +0.25];

      for (let r = 0; r < 2; r++) {
        const rz = rowZs[r];
        // Seat cushion bench
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.12, 0.34), seatMat);
        bench.position.set(0, 0.30, rz);
        carBody.add(bench);

        // Animated Lap-Bar Restraint for this row
        const barPivot = new THREE.Group();
        barPivot.position.set(0, 0.42, rz + 0.32);
        const barBuilder = createStrutBuilder();
        barBuilder.addStrut(-0.44, 0, 0, -0.44, 0.22, -0.22, 0.04, 0.04);
        barBuilder.addStrut(+0.44, 0, 0, +0.44, 0.22, -0.22, 0.04, 0.04);
        barBuilder.addStrut(-0.46, 0.22, -0.22, +0.46, 0.22, -0.22, 0.055, 0.055);
        barPivot.add(new THREE.Mesh(barBuilder.buildGeometry(), brassMat));
        carBody.add(barPivot);
        restraintPivots.push(barPivot);

        // 2 Riders in this row
        for (let s = 0; s < 2; s++) {
          const riderIdx = c * 4 + r * 2 + s;
          const rider = createRiderMesh(riderIdx);
          rider.root.position.set(seatXs[s], 0.0, rz - 0.02);
          rider.carIndex = c;
          rider.rowIndex = r;
          rider.seatIndex = s;
          carBody.add(rider.root);
          allRiders.push(rider);

          if (c === 0 && r === 0) {
            frontRowRiders.push(rider);
          }
        }
      }

      carObjects.push({
        root: carRoot,
        body: carBody
      });
    }

    function applyCoasterStyling(coaster) {
      if (!coaster) return;
      bodyMat.color.setHex(coaster.carColor || 0xd9383a);
      trimMat.color.setHex(coaster.carTrimColor || 0xf4e9d1);
      for (let i = 0; i < styleProps.wood.length; i++) styleProps.wood[i].visible = (coaster.type === 'wood');
      for (let i = 0; i < styleProps.steel.length; i++) styleProps.steel[i].visible = (coaster.type === 'steel');
      for (let i = 0; i < styleProps.mine.length; i++) styleProps.mine[i].visible = (coaster.type === 'mine');
    }

    return {
      group: trainGroup,
      carObjects,
      allRiders,
      frontRowRiders,
      restraintPivots,
      applyCoasterStyling
    };
  }

  // ============================================================================
  // 6. CPE.TRACK_VIEW PUBLIC API
  // ============================================================================
  CPE.TRACK_VIEW = {
    scene: null,
    rootGroup: null,
    station: null,
    coasterViews: [],
    train: null,
    headlampLight: null,
    headlampTarget: null,
    chainPhase: 0,
    bellTimer: 0,
    leverAnim: 0,
    isFirstPerson: false,
    elapsedTime: 0,

    init(scene) {
      this.scene = scene;
      this.rootGroup = new THREE.Group();
      this.rootGroup.name = 'CPE_TrackViewRoot';
      scene.add(this.rootGroup);

      // 1. Build Permanent Grand Coaster Station
      this.station = buildGrandStation();
      this.rootGroup.add(this.station.group);

      // 2. Pre-build 3D Track, Ties, Supports, Chain Lift & Brakes for all 3 Coasters
      this.coasterViews = [];
      const coasters = CPE.COASTERS || [];
      const activeIdx = (CPE.RIDE && typeof CPE.RIDE.coasterIndex === 'number') ? CPE.RIDE.coasterIndex : 0;

      for (let i = 0; i < coasters.length; i++) {
        const cv = buildCoasterGroup(coasters[i]);
        cv.group.visible = (i === activeIdx);
        this.rootGroup.add(cv.group);
        this.coasterViews.push(cv);
      }

      // 3. Build 5-Car Train with 20 Riders
      this.train = buildTrain();
      if (coasters[activeIdx]) {
        this.train.applyCoasterStyling(coasters[activeIdx]);
      }
      this.rootGroup.add(this.train.group);

      // 4. Bind or Create Front Car Headlamp Light (Slot 0 in CPE.LIGHTS)
      CPE.LIGHTS = CPE.LIGHTS || {};
      if (CPE.LIGHTS.headlamp) {
        this.headlampLight = CPE.LIGHTS.headlamp;
      } else if (Array.isArray(CPE.LIGHTS.pointLights) && CPE.LIGHTS.pointLights[0]) {
        this.headlampLight = CPE.LIGHTS.pointLights[0];
        CPE.LIGHTS.headlamp = this.headlampLight;
      } else if (Array.isArray(CPE.LIGHTS.slots) && CPE.LIGHTS.slots[0]) {
        this.headlampLight = CPE.LIGHTS.slots[0];
        CPE.LIGHTS.headlamp = this.headlampLight;
      } else {
        const ptLight = new THREE.PointLight(0xffdf88, 0.0, 28.0, 1.5);
        scene.add(ptLight);
        this.headlampLight = ptLight;
        CPE.LIGHTS.headlamp = ptLight;
      }

      // 5. Subscribe to CPE.events
      if (CPE.events && typeof CPE.events.on === 'function') {
        CPE.events.on('coasterChanged', (data) => {
          const idx = data && typeof data.index === 'number' ? data.index : CPE.RIDE.coasterIndex;
          for (let i = 0; i < this.coasterViews.length; i++) {
            this.coasterViews[i].group.visible = (i === idx);
          }
          if (this.train && CPE.COASTERS[idx]) {
            this.train.applyCoasterStyling(CPE.COASTERS[idx]);
          }
        });

        CPE.events.on('dispatch', () => {
          this.bellTimer = 1.6;
          this.leverAnim = 1.0;
        });
      }

      this.update(0.016);
      return this;
    },

    /**
     * Hides the front-row riders of Car 0 when First-Person camera is active
     * so the camera never clips inside a rider's head or raised arms.
     */
    setFirstPersonHide(isFirstPerson) {
      this.isFirstPerson = !!isFirstPerson;
      if (!this.train || !this.train.frontRowRiders) return;
      for (let i = 0; i < this.train.frontRowRiders.length; i++) {
        this.train.frontRowRiders[i].root.visible = !this.isFirstPerson;
      }
    },

    /**
     * Convenience helper for camera controller to read front-seat eye position,
     * forward target, and banked up vector directly above Car 0's sculpted nose.
     */
    getFirstPersonPose(outEye, outTarget, outUp) {
      if (!CPE.RIDE || !CPE.RIDE.cars || !CPE.RIDE.cars[0]) return false;
      const car0 = CPE.RIDE.cars[0];
      if (outEye) {
        outEye.copy(car0.pos)
          .addScaledVector(car0.normal, 0.96)
          .addScaledVector(car0.tangent, 0.32);
      }
      if (outTarget) {
        outTarget.copy(car0.pos)
          .addScaledVector(car0.normal, 0.88)
          .addScaledVector(car0.tangent, 8.5);
      }
      if (outUp) {
        outUp.copy(car0.normal);
      }
      return true;
    },

    update(dtRaw) {
      const dt = Math.min(0.05, dtRaw || 0.016);
      this.elapsedTime += dt;

      updateLocalGlowMaterials();

      const ride = CPE.RIDE;
      if (!ride) return;

      const activeIdx = ride.coasterIndex || 0;
      const activeCoaster = ride.coaster || (CPE.COASTERS && CPE.COASTERS[activeIdx]);
      const timeScale = ride.timeScale || 1;
      const scaledDt = dt * timeScale;

      // 1. Ensure active coaster visibility matches CPE.RIDE.coasterIndex
      for (let i = 0; i < this.coasterViews.length; i++) {
        this.coasterViews[i].group.visible = (i === activeIdx);
      }

      // 2. Animate 55 Chain Dogs moving continuously up the active coaster's lift hill
      const liftSpeed = (activeCoaster && activeCoaster.liftSpeed) ? activeCoaster.liftSpeed : 4.5;
      this.chainPhase = (this.chainPhase + liftSpeed * scaledDt) % 1000.0;
      if (this.coasterViews[activeIdx]) {
        this.coasterViews[activeIdx].updateChainDogs(this.chainPhase);
      }

      // 3. Animate Station Boarding Air-Gates, Dispatch Lever & Bell
      if (this.station) {
        const gateOpen = typeof ride.gateOpen === 'number' ? ride.gateOpen : 1.0;
        const swingAngle = gateOpen * (Math.PI * 0.48); // swings ~86 deg open onto platform
        for (let i = 0; i < this.station.gateLeaves.length; i++) {
          const gl = this.station.gateLeaves[i];
          gl.leftPivot.rotation.y = -swingAngle;
          gl.rightPivot.rotation.y = +swingAngle;
        }

        // Dispatch lever tilts forward during DISPATCH/RIDE or when triggered
        const wantLever = (ride.state === 'DISPATCH' || ride.state === 'LIFT' || ride.state === 'RIDE') ? 1.0 : 0.0;
        this.leverAnim += (wantLever - this.leverAnim) * Math.min(1.0, dt * 8.0);
        if (this.station.leverPivot) {
          this.station.leverPivot.rotation.x = (this.leverAnim - 0.5) * 0.85;
        }

        // Station bell rings on dispatch
        if (this.bellTimer > 0) {
          this.bellTimer = Math.max(0, this.bellTimer - dt);
          if (this.station.bellPivot) {
            this.station.bellPivot.rotation.z = Math.sin(this.elapsedTime * 34.0) * 0.42 * (this.bellTimer / 1.6);
          }
        } else if (this.station.bellPivot) {
          this.station.bellPivot.rotation.z = 0;
        }
      }

      // 4. Update 5 Articulated Cars, Lap Bars, 20 Riders & Front Headlamp
      if (this.train && ride.cars) {
        const restraintClosed = typeof ride.restraintClosed === 'number' ? ride.restraintClosed : 0.0;
        // Open = tilted forward (+0.55 rad), Closed = down over lap (-0.38 rad)
        const barAngle = 0.55 - restraintClosed * 0.93;
        for (let i = 0; i < this.train.restraintPivots.length; i++) {
          this.train.restraintPivots[i].rotation.x = barAngle;
        }

        for (let c = 0; c < 5; c++) {
          const carState = ride.cars[c];
          const carObj = this.train.carObjects[c];
          if (!carState || !carObj) continue;

          carObj.root.matrix.copy(carState.matrix);
          carObj.root.matrixWorldNeedsUpdate = true;
        }

        // Animate all 20 riders (upper body G-lean + hands thrown up with car.armsUp)
        for (let r = 0; r < this.train.allRiders.length; r++) {
          const rider = this.train.allRiders[r];
          const carState = ride.cars[rider.carIndex];
          if (!carState) continue;

          const smp = carState.sample || ride.currentSample;
          const latG = smp ? (smp.latG || 0) : 0;
          const vG = smp ? (smp.vG !== undefined ? smp.vG : 1.0) : 1.0;
          const armsUp = carState.armsUp || 0;

          // Subtle individualized excitement phase
          const phase = this.elapsedTime * 7.5 + rider.riderIndex * 1.37;
          const wave = Math.sin(phase) * (0.04 + 0.14 * armsUp);

          // Upper body leans slightly with lateral & vertical G
          const leanZ = Math.max(-0.28, Math.min(0.28, -latG * 0.18 + wave * 0.25));
          const leanX = Math.max(-0.22, Math.min(0.22, (1.0 - vG) * 0.10 - armsUp * 0.08));
          rider.upperBody.rotation.z = leanZ;
          rider.upperBody.rotation.x = leanX;

          // Head looks slightly into turns and bobs with excitement
          rider.headGroup.rotation.y = Math.sin(phase * 0.7) * 0.12;
          rider.headGroup.rotation.x = -armsUp * 0.15 + Math.cos(phase) * 0.05;

          // Arms rotate from resting on lap bar (-0.78 rad) to thrown high overhead (-2.88 rad)
          const baseArmX = -0.78 - armsUp * 2.10;
          rider.leftArmPivot.rotation.x = baseArmX + wave;
          rider.rightArmPivot.rotation.x = baseArmX - wave;
          rider.leftArmPivot.rotation.z = -0.08 - armsUp * 0.24;
          rider.rightArmPivot.rotation.z = +0.08 + armsUp * 0.24;
        }

        // 5. Update Front Headlamp Light (active at Dusk/Night AND inside Ember Mine Tunnel!)
        if (this.headlampLight && ride.cars[0]) {
          const car0 = ride.cars[0];
          const inTunnel = !!(car0.sample && car0.sample.inTunnel);
          const nf = (CPE.lighting && typeof CPE.lighting.nightFactor === 'number')
            ? CPE.lighting.nightFactor
            : ((CPE.timeOfDay === 'night') ? 1.0 : (CPE.timeOfDay === 'dusk' ? 0.65 : 0.0));

          const lampFactor = inTunnel ? Math.max(0.85, nf) : nf;
          this.headlampLight.intensity = lampFactor * 1.9;
          this.headlampLight.distance = 28.0;

          // Position light just ahead of Car 0's nose along tangent so it illuminates the rails ahead cleanly
          this.headlampLight.position.copy(car0.pos)
            .addScaledVector(car0.normal, 0.65)
            .addScaledVector(car0.tangent, 2.6);
        }
      }
    }
  };
})();
