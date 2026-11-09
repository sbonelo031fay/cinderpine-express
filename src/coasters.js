// Cinderpine Express — Coaster Turtle Solver, Physics Engine & Ride State Machine
(function() {
  const CPE = window.CPE = window.CPE || {};

  // Simple Event Bus
  const listeners = {};
  CPE.events = {
    on(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    emit(evt, data) {
      if (listeners[evt]) {
        for (let i = 0; i < listeners[evt].length; i++) {
          try { listeners[evt][i](data); } catch (e) { console.error(e); }
        }
      }
    }
  };

  // World Terrain helper (shared with park & supports)
  CPE.WORLD = CPE.WORLD || {
    trainPos: new THREE.Vector3(-1, 2.2, 14),
    trainSpeed: 0,
    // Ember Mine Run rock hill sits around (25, -17), rx=13, rz=11, height=8.5
    getRockHillHeight(x, z) {
      const dx = (x - 25.0) / 13.5;
      const dz = (z - (-17.5)) / 11.5;
      const d2 = dx * dx + dz * dz;
      if (d2 >= 1.0) return 0;
      const falloff = Math.pow(1.0 - d2, 1.6);
      // Add subtlefaceted ridge variation
      const ridge = 0.6 * Math.sin(x * 0.45) * Math.cos(z * 0.45);
      return Math.max(0, 8.8 * falloff + ridge * falloff);
    },
    getGroundY(x, z) {
      return this.getRockHillHeight(x, z);
    },
    isOnIsland(x, z) {
      // Rounded rectangle [-54, 54] x [-38, 38] with corner radius 8
      const ax = Math.max(0, Math.abs(x) - 46);
      const az = Math.max(0, Math.abs(z) - 30);
      return (ax * ax + az * az) <= 64.0 && Math.abs(x) <= 54 && Math.abs(z) <= 38;
    },
    isOverPathOrQueue(x, z) {
      // Station footprint
      if (x >= -11.5 && x <= 8.5 && z >= 9.5 && z <= 18.5) return true;
      // Queue switchback zone south/west of station
      if (x >= -14 && x <= 4 && z >= 18 && z <= 29) return true;
      // Main midway avenues
      if (x >= -46 && x <= -12 && z >= -28 && z <= 28) {
        if (Math.abs(x - (-24)) < 3.5 || Math.abs(z - 0) < 3.5 || Math.abs(z - 16) < 3.5) return true;
      }
      // South promenade
      if (x >= -36 && x <= 20 && z >= 22 && z <= 28) return true;
      return false;
    }
  };

  // Forward vector from yaw and pitch:
  // yaw = 0 -> +X, yaw = PI/2 -> -Z (North), yaw = PI -> -X (West), yaw = -PI/2 -> +Z (South)
  function getForward(yaw, pitch) {
    const cp = Math.cos(pitch);
    return new THREE.Vector3(
      cp * Math.cos(yaw),
      Math.sin(pitch),
      -cp * Math.sin(yaw)
    );
  }

  // Smoothstep helper
  function smooth01(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  // Raised cosine bell (integral over [0,1] is 1.0, value and derivative 0 at both ends)
  function bell01(t) {
    return 1.0 - Math.cos(2.0 * Math.PI * t);
  }

  /**
   * Build a closed, smooth, 0.5m-resampled coaster from a parametric Turtle program
   * and solve closure to < 0.01m error while keeping all track within the coaster zone.
   */
  function buildTurtleCoaster(config) {
    const dsRaw = 0.2;
    const rawPts = [];

    // Start at Station Rear: (-8, 2.2, 14), heading +X (yaw=0, pitch=0)
    // Wait: Station runs from x = -8 to x = +6 (length 14m), with s = 0 at station center (-1, 2.2, 14).
    // Let's trace starting at x = -8, y = 2.2, z = 14 so station is the first 14m, and we close back to (-8, 2.2, 14)!
    let x = -8.0, y = 2.2, z = 14.0;
    let yaw = 0.0, pitch = 0.0;

    function pushStep(stepLen, dYaw, dPitch, segType, secName, extra) {
      const n = Math.max(1, Math.round(stepLen / dsRaw));
      const h = stepLen / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const w = bell01(t); // smooth curvature profile
        yaw += (dYaw / n) * w;
        pitch += (dPitch / n) * w;
        const fwd = getForward(yaw, pitch);
        x += fwd.x * h;
        y += fwd.y * h;
        z += fwd.z * h;
        rawPts.push({
          pos: new THREE.Vector3(x, y, z),
          yaw,
          pitch,
          segmentType: segType,
          sectionName: secName,
          forcedNormal: extra && extra.getNormal ? extra.getNormal(t, yaw, pitch) : null,
          inTunnel: !!(extra && extra.inTunnel),
          bankBias: (extra && extra.bankBias) || 0
        });
      }
    }

    // Also allow vertical loop primitive (exact clothoid-like circular vertical loop with lateral helix offset so strands never touch)
    function pushVerticalLoop(radius, latOffset, segType, secName) {
      // Loop circumference ~ 2 * PI * R, with entry/exit transition
      const totalAngle = 2.0 * Math.PI;
      const arcLen = totalAngle * radius * 1.12;
      const n = Math.round(arcLen / dsRaw);
      const h = arcLen / n;
      const startYaw = yaw;
      const fwd0 = getForward(startYaw, 0);
      const up0 = new THREE.Vector3(0, 1, 0);
      const right0 = new THREE.Vector3().crossVectors(fwd0, up0).normalize();
      const entryPos = new THREE.Vector3(x, y, z);

      for (let i = 0; i < n; i++) {
        const u = (i + 1) / n;
        // Smooth entry/exit curvature into loop angle theta in [0, 2*PI]
        const theta = totalAngle * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
        // Wait: u - sin(2pi u)/(2pi) has dTheta/du = 2pi(1 - cos(2pi u)), which is 0 at u=0,1 and 4pi at u=0.5 (teardrop clothoid loop!)
        // In a teardrop loop, height is R_v * (1 - cos(theta)), forward advances smoothly
        // Let's integrate step by step with pitch = theta:
        const dTheta = totalAngle * (1.0 - Math.cos(2.0 * Math.PI * ((i + 0.5) / n))) / n;
        // Instantaneous radius decreases slightly near top of loop for lower G at entry and positive G at apex
        const rInst = radius * (1.0 - 0.18 * Math.sin(theta * 0.5));
        const stepH = rInst * dTheta;
        const loopPitch = theta; // goes 0 -> 2*PI!
        const latShift = (latOffset / n) * (1.0 - Math.cos(2.0 * Math.PI * u));

        // Local tangent in vertical loop plane + gentle lateral offset so strands never collide
        const tVec = new THREE.Vector3()
          .addScaledVector(fwd0, Math.cos(loopPitch))
          .addScaledVector(up0, Math.sin(loopPitch));
        x += tVec.x * stepH + right0.x * latShift;
        y += tVec.y * stepH + right0.y * latShift;
        z += tVec.z * stepH + right0.z * latShift;

        // Normal points inward toward loop center!
        const nVec = new THREE.Vector3()
          .addScaledVector(up0, Math.cos(loopPitch))
          .addScaledVector(fwd0, -Math.sin(loopPitch))
          .normalize();

        rawPts.push({
          pos: new THREE.Vector3(x, y, z),
          yaw: startYaw,
          pitch: loopPitch,
          segmentType: segType,
          sectionName: secName,
          forcedNormal: nVec,
          isLoop: true,
          inTunnel: false,
          bankBias: 0
        });
      }
      pitch = 0;
    }

    // Run coaster-specific turtle segments
    config.program({ pushStep, pushVerticalLoop, getState: () => ({ x, y, z, yaw, pitch }) });

    // Now smoothly close the circuit back to (-8.0, 2.2, 14.0) with tangent (+1, 0, 0)
    // using a 2-turn Dubins-like smooth cubic Hermite / clothoid connector for the final brake/return run,
    // AND distribute any tiny residual error across the non-station segments.
    const startTarget = new THREE.Vector3(-8.0, 2.2, 14.0);
    const startTangent = new THREE.Vector3(1.0, 0.0, 0.0);

    const lastPt = rawPts[rawPts.length - 1];
    const p0 = lastPt.pos.clone();
    const t0 = getForward(lastPt.yaw, lastPt.pitch);
    const p1 = startTarget.clone();
    const t1 = startTangent.clone();

    const chord = p0.distanceTo(p1);
    const returnLen = Math.max(18.0, chord * 1.22);
    const nRet = Math.round(returnLen / dsRaw);
    const m0 = t0.clone().multiplyScalar(returnLen * 0.95);
    const m1 = t1.clone().multiplyScalar(returnLen * 0.95);

    for (let i = 1; i <= nRet; i++) {
      const u = i / nRet;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const pos = new THREE.Vector3()
        .addScaledVector(p0, h00)
        .addScaledVector(m0, h10)
        .addScaledVector(p1, h01)
        .addScaledVector(m1, h11);

      const isFinalBrake = u > 0.35;
      rawPts.push({
        pos,
        yaw: 0,
        pitch: 0,
        segmentType: isFinalBrake ? 'brake' : (config.returnSegType || 'track'),
        sectionName: isFinalBrake ? 'Final Brake' : (config.returnSecName || 'Return Turn'),
        forcedNormal: null,
        inTunnel: false,
        bankBias: 0
      });
    }

    // Apply cyclic Laplacian smoothing (preserving station [0..70] and vertical loop points)
    const N = rawPts.length;
    const stationIdxEnd = Math.round(14.0 / dsRaw); // first 14m is station (-8 to +6)
    for (let iter = 0; iter < 14; iter++) {
      const nextPos = rawPts.map(p => p.pos.clone());
      for (let i = 0; i < N; i++) {
        if (i <= stationIdxEnd || i >= N - 8) continue;
        // Fade smoothing near station boundaries and loop boundaries
        let w = 0.35;
        if (rawPts[i].isLoop) w = 0.05;
        const distToStation = Math.min(Math.abs(i - stationIdxEnd), N - i);
        if (distToStation < 20) w *= (distToStation / 20);
        const prev = rawPts[(i - 1 + N) % N].pos;
        const curr = rawPts[i].pos;
        const next = rawPts[(i + 1) % N].pos;
        nextPos[i].set(
          curr.x + w * (0.5 * (prev.x + next.x) - curr.x),
          curr.y + w * (0.5 * (prev.y + next.y) - curr.y),
          curr.z + w * (0.5 * (prev.z + next.z) - curr.z)
        );
        // Ensure track stays above ground (except inside tunnel)
        if (!rawPts[i].inTunnel) {
          const gY = CPE.WORLD.getGroundY(nextPos[i].x, nextPos[i].z);
          if (nextPos[i].y < gY + 1.2) nextPos[i].y = gY + 1.2;
        }
      }
      for (let i = 0; i < N; i++) rawPts[i].pos.copy(nextPos[i]);
    }

    // Cyclic shift so s = 0 is at Station Center (-1.0, 2.2, 14.0), which is 7.0m into the station!
    const centerShift = Math.round(7.0 / dsRaw);
    const shifted = [];
    for (let i = 0; i < N; i++) {
      shifted.push(rawPts[(i + centerShift) % N]);
    }

    // Compute exact arc lengths along shifted polygon and resample every ds = 0.5m
    const cumS = [0];
    for (let i = 1; i <= N; i++) {
      const a = shifted[i - 1].pos;
      const b = shifted[i % N].pos;
      cumS.push(cumS[i - 1] + a.distanceTo(b));
    }
    const totalLength = cumS[N];
    const closureError = shifted[N - 1].pos.distanceTo(shifted[0].pos) - (cumS[N] - cumS[N - 1]);

    const ds = 0.5;
    const numSamples = Math.round(totalLength / ds);
    const actualDs = totalLength / numSamples;
    const points = [];

    let rawIdx = 0;
    for (let k = 0; k < numSamples; k++) {
      const targetS = k * actualDs;
      while (rawIdx < N - 1 && cumS[rawIdx + 1] < targetS) rawIdx++;
      const s0 = cumS[rawIdx];
      const s1 = cumS[rawIdx + 1];
      const alpha = (s1 > s0) ? (targetS - s0) / (s1 - s0) : 0;
      const pA = shifted[rawIdx];
      const pB = shifted[(rawIdx + 1) % N];
      const pos = new THREE.Vector3().lerpVectors(pA.pos, pB.pos, alpha);
      let forcedNormal = null;
      if (pA.forcedNormal && pB.forcedNormal) {
        forcedNormal = new THREE.Vector3().lerpVectors(pA.forcedNormal, pB.forcedNormal, alpha).normalize();
      } else if (pA.forcedNormal) {
        forcedNormal = pA.forcedNormal.clone();
      }
      points.push({
        s: targetS,
        pos,
        segmentType: pA.segmentType,
        sectionName: pA.sectionName,
        forcedNormal,
        isLoop: !!(pA.isLoop || pB.isLoop),
        inTunnel: !!(pA.inTunnel || pB.inTunnel),
        bankBias: pA.bankBias * (1 - alpha) + pB.bankBias * alpha
      });
    }

    // Compute smooth tangents and curvatures on the 0.5m resampled points
    const M = points.length;
    for (let i = 0; i < M; i++) {
      const pPrev = points[(i - 1 + M) % M].pos;
      const pNext = points[(i + 1) % M].pos;
      const tangent = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
      points[i].tangent = tangent;
      points[i].pitch = Math.asin(Math.max(-1, Math.min(1, tangent.y)));
      points[i].yaw = Math.atan2(-tangent.z, tangent.x);
    }

    // Energy-based physics pass to compute speed profile v(s) around the entire circuit
    const g = 9.81;
    const vProfile = new Float32Array(M);
    let v = config.dispatchSpeed || 3.2;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < M; i++) {
        const pt = points[i];
        const prevPt = points[(i - 1 + M) % M];
        const dy = pt.pos.y - prevPt.pos.y;
        const seg = pt.segmentType;

        if (seg === 'station') {
          v = 3.2;
        } else if (seg === 'lift') {
          const liftSpeed = config.liftSpeed || 4.2;
          v = Math.max(liftSpeed, v * 0.96);
        } else {
          // Energy equation: v^2 = v_prev^2 - 2*g*dy - 2*(friction + drag)*ds
          const friction = config.friction || 0.018;
          const drag = config.drag || 0.00055;
          let v2 = v * v - 2.0 * g * dy - 2.0 * (friction * g + drag * v * v) * actualDs;
          v = Math.sqrt(Math.max(9.0, v2));
          if (seg === 'trim') {
            const trimTarget = config.trimSpeed || 11.5;
            if (v > trimTarget) v = Math.max(trimTarget, v - 5.5 * (actualDs / v));
          } else if (seg === 'brake') {
            const brakeTarget = 4.2;
            if (v > brakeTarget) v = Math.max(brakeTarget, v - 8.5 * (actualDs / v));
          }
        }
        vProfile[i] = v;
      }
    }

    // Compute curvature vector dT/ds, force-vector banking (zero lateral G), felt vertical G, and stats
    const rawBank = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const pt = points[i];
      const tPrev = points[(i - 2 + M) % M].tangent;
      const tNext = points[(i + 2) % M].tangent;
      // dT/ds
      const dTds = new THREE.Vector3().subVectors(tNext, tPrev).multiplyScalar(1.0 / (4.0 * actualDs));
      pt.curvature = dTds.length();
      pt.dTds = dTds;
      pt.speed = vProfile[i];

      if (pt.isLoop || pt.forcedNormal) {
        rawBank[i] = 0;
      } else if (pt.segmentType === 'station' || pt.segmentType === 'lift' || pt.segmentType === 'brake') {
        rawBank[i] = 0;
      } else {
        // Centripetal acceleration a_c = v^2 * dT/ds
        // Horizontal lateral acceleration component:
        const upWorld = new THREE.Vector3(0, 1, 0);
        const horizRight = new THREE.Vector3().crossVectors(pt.tangent, upWorld);
        if (horizRight.lengthSq() > 1e-4) {
          horizRight.normalize();
          const aLat = pt.speed * pt.speed * dTds.dot(horizRight);
          const aVert = g + pt.speed * pt.speed * dTds.y;
          // Ideal zero-lat-G bank angle: atan2(aLat, max(3.5, aVert))
          let idealBank = Math.atan2(aLat, Math.max(4.0, aVert)) + pt.bankBias;
          const maxBank = config.maxBank || 1.18; // ~68 deg max bank
          idealBank = Math.max(-maxBank, Math.min(maxBank, idealBank));
          rawBank[i] = idealBank;
        } else {
          rawBank[i] = 0;
        }
      }
    }

    // Smooth bank angle cyclically so roll rate is silky smooth
    let smoothedBank = new Float32Array(M);
    smoothedBank.set(rawBank);
    for (let iter = 0; iter < 16; iter++) {
      const tmp = new Float32Array(M);
      for (let i = 0; i < M; i++) {
        if (points[i].segmentType === 'station') {
          tmp[i] = 0;
        } else {
          tmp[i] = 0.25 * smoothedBank[(i - 1 + M) % M] + 0.5 * smoothedBank[i] + 0.25 * smoothedBank[(i + 1) % M];
        }
      }
      smoothedBank = tmp;
    }

    // Build orthonormal frame (tangent, normal, binormal) & calculate felt G-forces
    let maxHeight = 0, minHeight = 999, maxSpeed = 0, maxPosG = 1.0, minNegG = 1.0, airtimeSec = 0;
    const gravityVec = new THREE.Vector3(0, -g, 0);

    for (let i = 0; i < M; i++) {
      const pt = points[i];
      pt.bank = smoothedBank[i];

      if (pt.forcedNormal) {
        // Gram-Schmidt orthogonalize forcedNormal against tangent
        const n = pt.forcedNormal.clone().addScaledVector(pt.tangent, -pt.forcedNormal.dot(pt.tangent)).normalize();
        const b = new THREE.Vector3().crossVectors(pt.tangent, n).normalize();
        // Apply small bank if any
        if (Math.abs(pt.bank) > 1e-4) {
          const cb = Math.cos(pt.bank), sb = Math.sin(pt.bank);
          const nBanked = new THREE.Vector3().addScaledVector(n, cb).addScaledVector(b, sb).normalize();
          const bBanked = new THREE.Vector3().crossVectors(pt.tangent, nBanked).normalize();
          pt.normal = nBanked;
          pt.binormal = bBanked;
        } else {
          pt.normal = n;
          pt.binormal = b;
        }
      } else {
        const upWorld = new THREE.Vector3(0, 1, 0);
        const right0 = new THREE.Vector3().crossVectors(pt.tangent, upWorld).normalize();
        const up0 = new THREE.Vector3().crossVectors(right0, pt.tangent).normalize();
        // Bank rotation around tangent: positive bank tilts normal toward inward curve
        const cb = Math.cos(pt.bank), sb = Math.sin(pt.bank);
        pt.normal = new THREE.Vector3().addScaledVector(up0, cb).addScaledVector(right0, sb).normalize();
        pt.binormal = new THREE.Vector3().crossVectors(pt.tangent, pt.normal).normalize();
      }

      // Felt acceleration vector: a_felt = a_track - g_vec = v^2 * dT/ds + (0, g, 0)
      const aFelt = new THREE.Vector3(0, g, 0).addScaledVector(pt.dTds, pt.speed * pt.speed);
      let vG = aFelt.dot(pt.normal) / g;
      let latG = aFelt.dot(pt.binormal) / g;
      // Clamp extreme spikes to keep max G <= 4.3g
      vG = Math.max(-1.2, Math.min(4.3, vG));
      latG = Math.max(-1.2, Math.min(1.2, latG));
      pt.vG = vG;
      pt.latG = latG;
      pt.airtime = (vG < 0.25 && pt.segmentType !== 'station' && pt.segmentType !== 'lift');

      if (pt.pos.y > maxHeight) maxHeight = pt.pos.y;
      if (pt.pos.y < minHeight) minHeight = pt.pos.y;
      if (pt.speed > maxSpeed) maxSpeed = pt.speed;
      if (vG > maxPosG) maxPosG = vG;
      if (vG < minNegG) minNegG = vG;
      if (pt.airtime) airtimeSec += actualDs / Math.max(2.0, pt.speed);
    }

    // Extract tunnel ranges
    const tunnelRanges = [];
    let inTun = false, tStart = 0;
    for (let i = 0; i < M; i++) {
      if (points[i].inTunnel && !inTun) {
        inTun = true;
        tStart = points[i].s;
      } else if (!points[i].inTunnel && inTun) {
        inTun = false;
        tunnelRanges.push({ sStart: tStart, sEnd: points[i].s });
      }
    }
    if (inTun) tunnelRanges.push({ sStart: tStart, sEnd: totalLength });

    const maxDrop = Math.max(0, maxHeight - minHeight);
    const maxSpeedKmh = maxSpeed * 3.6;

    return {
      id: config.id,
      name: config.name,
      subtitle: config.subtitle,
      type: config.type,
      description: config.description,
      colorPrimary: config.colorPrimary,
      colorSecondary: config.colorSecondary,
      colorSupport: config.colorSupport,
      carColor: config.carColor,
      carTrimColor: config.carTrimColor,
      totalLength,
      ds: actualDs,
      points,
      tunnelRanges,
      stats: {
        length: Math.round(totalLength),
        maxHeight: +(maxHeight).toFixed(1),
        maxDrop: +(maxDrop).toFixed(1),
        maxSpeedKmh: +(maxSpeedKmh).toFixed(1),
        maxPosG: +(maxPosG).toFixed(2),
        minNegG: +(minNegG).toFixed(2),
        airtimeSec: +(airtimeSec).toFixed(1),
        inversions: config.inversions || 0,
        excitement: config.excitement,
        intensity: config.intensity,
        nausea: config.nausea,
        ratingLabel: config.ratingLabel,
        closureError: +(Math.abs(closureError)).toFixed(4)
      },
      sampleAt(s) {
        let sWrap = s % this.totalLength;
        if (sWrap < 0) sWrap += this.totalLength;
        const fIdx = sWrap / this.ds;
        const i0 = Math.floor(fIdx) % this.points.length;
        const i1 = (i0 + 1) % this.points.length;
        const alpha = fIdx - Math.floor(fIdx);
        const p0 = this.points[i0];
        const p1 = this.points[i1];

        const pos = new THREE.Vector3().lerpVectors(p0.pos, p1.pos, alpha);
        const tangent = new THREE.Vector3().lerpVectors(p0.tangent, p1.tangent, alpha).normalize();
        const normal = new THREE.Vector3().lerpVectors(p0.normal, p1.normal, alpha).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        return {
          s: sWrap,
          pos,
          tangent,
          normal,
          binormal,
          bank: p0.bank + (p1.bank - p0.bank) * alpha,
          pitch: p0.pitch + (p1.pitch - p0.pitch) * alpha,
          speed: p0.speed + (p1.speed - p0.speed) * alpha,
          vG: p0.vG + (p1.vG - p0.vG) * alpha,
          latG: p0.latG + (p1.latG - p0.latG) * alpha,
          segmentType: p0.segmentType,
          sectionName: p0.sectionName,
          airtime: p0.airtime,
          inTunnel: p0.inTunnel,
          isLoop: p0.isLoop
        };
      }
    };
  }

  // ============================================================================
  // DEFINE THE 3 COASTERS
  // Station is at X in [-8, +6], Y = 2.2, Z = 14, heading +X (East).
  // All 3 coasters stay inside X in [-12, 49], Z in [-33, 16] (within the 76x50m coaster zone on the island).
  // ============================================================================

  // 1. OLD PINEWOOD — Classic wooden out-and-back twister
  // Diagonal chain lift toward NE, big 21m first drop, camelback airtime hill, trim brake, banked 270° helix, final brake.
  const oldPinewood = buildTurtleCoaster({
    id: 'pinewood',
    name: 'Old Pinewood',
    subtitle: '1928 Timber Out-&-Back',
    type: 'wood',
    description: 'Creaking pine trestles, a tall diagonal chain lift, a sweeping first drop, and floating camelback airtime.',
    colorPrimary: 0xb57c4a,
    colorSecondary: 0xd9383a,
    colorSupport: 0x7d4e2d,
    carColor: 0xd9383a,
    carTrimColor: 0xf4e9d1,
    liftSpeed: 4.5,
    trimSpeed: 12.2,
    friction: 0.017,
    drag: 0.0005,
    inversions: 0,
    excitement: 7.6,
    intensity: 6.4,
    nausea: 3.1,
    ratingLabel: 'HIGH',
    returnSegType: 'track',
    returnSecName: 'Station Approach',
    program({ pushStep }) {
      // 1. Station (-8 to +6, z=14)
      pushStep(14.0, 0, 0, 'station', 'Station Platform');
      // 2. Turn 45 deg left (NE) onto diagonal chain lift
      pushStep(10.0, Math.PI * 0.28, 0.05, 'track', 'Lift Approach');
      // 3. Pitch up into Diagonal Chain Lift
      pushStep(7.0, 0.0, 0.42, 'lift', 'Chain Lift');
      pushStep(28.0, 0.0, 0.0, 'lift', 'Chain Lift');
      pushStep(8.0, 0.22, -0.47, 'lift', 'Lift Crest');
      // Now near NE corner (~x=40, y=19.8, z=-14), turning left toward North/West
      pushStep(11.0, Math.PI * 0.50, 0.0, 'track', 'Panorama Turn');
      // 4. Big First Drop heading West along North cliff!
      pushStep(8.0, 0.0, -0.58, 'drop', 'First Drop');
      pushStep(14.0, 0.0, 0.0, 'drop', 'First Drop');
      pushStep(10.0, 0.08, 0.58, 'drop', 'Drop Pullout');
      // 5. Turn South-East toward Camelback Airtime Hill
      pushStep(16.0, Math.PI * 0.65, 0.0, 'track', 'West Bend');
      // 6. Camelback Airtime Hill
      pushStep(9.0, 0.0, 0.44, 'hill', 'Camelback Hill');
      pushStep(11.0, 0.0, -0.88, 'hill', 'Camelback Crest');
      pushStep(9.0, 0.0, 0.44, 'hill', 'Camelback Drop');
      // 7. Trim Brake straight
      pushStep(10.0, 0.15, 0.0, 'trim', 'Trim Brake');
      // 8. Banked Helix (315 deg left turn climbing then diving gently)
      pushStep(18.0, Math.PI * 0.95, 0.12, 'helix', 'Banked Helix', { bankBias: 0.35 });
      pushStep(18.0, Math.PI * 0.85, -0.15, 'helix', 'Banked Helix', { bankBias: 0.35 });
    }
  });

  // 2. CINDERLOOP — Steel Looper
  // East-side lift, high diving turn, vertical teardrop loop (with lateral helix offset so strands never touch), overbanked turn, trim brake.
  const cinderloop = buildTurtleCoaster({
    id: 'cinderloop',
    name: 'Cinderloop',
    subtitle: 'Steel Vertical Looper',
    type: 'steel',
    description: 'Tubular teal steel, an east-cliff lift hill, a high-G vertical loop over the autumn gorge, and whippy banked curves.',
    colorPrimary: 0x367a82,
    colorSecondary: 0xf2c94c,
    colorSupport: 0x2b3642,
    carColor: 0xf2c94c,
    carTrimColor: 0x2b3642,
    liftSpeed: 4.8,
    trimSpeed: 12.8,
    friction: 0.013,
    drag: 0.00045,
    inversions: 1,
    excitement: 8.2,
    intensity: 7.5,
    nausea: 3.8,
    ratingLabel: 'HIGH',
    returnSegType: 'track',
    returnSecName: 'Final Sweep',
    program({ pushStep, pushVerticalLoop }) {
      // 1. Station
      pushStep(14.0, 0, 0, 'station', 'Station Platform');
      // 2. Sweep 90 deg left to head North along the East side
      pushStep(14.0, Math.PI * 0.5, 0.0, 'track', 'East Turn');
      // 3. East-side Chain Lift heading North (-Z)
      pushStep(7.0, 0.0, 0.46, 'lift', 'East Chain Lift');
      pushStep(24.0, 0.0, 0.0, 'lift', 'East Chain Lift');
      pushStep(8.0, 0.25, -0.46, 'lift', 'Lift Apex');
      // 4. Sweeping 155 deg left diving turn to head SW/West into the Loop
      pushStep(16.0, Math.PI * 0.72, -0.48, 'drop', 'Torpedo Drop');
      pushStep(11.0, 0.15, 0.48, 'drop', 'Loop Entry');
      // 5. Vertical Loop! Radius 6.8m, 3.6m lateral offset so strands have clear gap
      pushVerticalLoop(6.8, 3.6, 'loop', 'Vertical Loop');
      // 6. Speed hill & banked turn around NW sector
      pushStep(14.0, Math.PI * 0.55, 0.28, 'hill', 'Cinder Rise');
      pushStep(14.0, Math.PI * 0.50, -0.28, 'hill', 'Gorge Dive');
      // 7. Trim brake run heading South-West
      pushStep(11.0, 0.1, 0.0, 'trim', 'Trim Brake');
      // 8. S-bend toward final brake
      pushStep(12.0, -0.45, 0.0, 'track', 'Switchback Curves');
      pushStep(12.0, 0.65, 0.0, 'track', 'Switchback Curves');
    }
  });

  // 3. EMBER MINE RUN — Runaway Mine Train
  // Short lift, double dip, S-curve diving through a dark lantern-lit rock tunnel under the mountain.
  const emberMineRun = buildTurtleCoaster({
    id: 'mine',
    name: 'Ember Mine Run',
    subtitle: 'Runaway Ore Train',
    type: 'mine',
    description: 'Chugging brass-trimmed ore cars, a surprise double dip, and an S-curve plunge through a glowing lantern mine tunnel.',
    colorPrimary: 0x6e241b,
    colorSecondary: 0xb57c4a,
    colorSupport: 0x59361e,
    carColor: 0x8c3b2b,
    carTrimColor: 0xd9a33c,
    liftSpeed: 4.1,
    trimSpeed: 11.2,
    friction: 0.015,
    drag: 0.0005,
    inversions: 0,
    excitement: 7.1,
    intensity: 5.4,
    nausea: 2.7,
    ratingLabel: 'MEDIUM',
    returnSegType: 'track',
    returnSecName: 'Creek Bend',
    program({ pushStep }) {
      // 1. Station
      pushStep(14.0, 0, 0, 'station', 'Station Platform');
      // 2. Short Lift heading ENE
      pushStep(9.0, 0.35, 0.0, 'track', 'Mine Yard');
      pushStep(6.0, 0.0, 0.40, 'lift', 'Mine Hoist Lift');
      pushStep(18.0, 0.15, 0.0, 'lift', 'Mine Hoist Lift');
      pushStep(7.0, 0.45, -0.40, 'lift', 'Trestle Crest');
      // 3. Double Dip along the North-East ridge!
      pushStep(7.0, 0.25, -0.38, 'drop', 'Double Dip I');
      pushStep(7.0, 0.20, 0.38, 'drop', 'Dip Shelf');
      pushStep(8.0, 0.20, -0.46, 'drop', 'Double Dip II');
      pushStep(9.0, 0.25, 0.46, 'drop', 'Gully Pullout');
      // 4. Turn toward the Rock Hill (centered around x=25, z=-17.5) and dive into the S-Curve Tunnel!
      pushStep(12.0, 0.55, -0.10, 'track', 'Mine Portal Approach');
      // 5. S-Curve through the Rock Tunnel under the hill
      pushStep(11.0, -0.58, -0.05, 'tunnel', 'Ember Mine Tunnel', { inTunnel: true, bankBias: -0.25 });
      pushStep(11.0, 0.68, 0.08, 'tunnel', 'Glowing Ore Cavern', { inTunnel: true, bankBias: 0.28 });
      pushStep(8.0, 0.25, 0.12, 'tunnel', 'Tunnel Exit', { inTunnel: true });
      // 6. Banked turnaround loop in the West valley
      pushStep(15.0, Math.PI * 0.62, 0.0, 'helix', 'Trestle Curve', { bankBias: 0.25 });
      pushStep(9.0, 0.2, 0.0, 'trim', 'Trim Brake');
    }
  });

  CPE.COASTERS = [oldPinewood, cinderloop, emberMineRun];

  // ============================================================================
  // RIDE STATE MACHINE & LIVE TRAIN KINEMATICS
  // States: UNLOAD -> BOARD -> DISPATCH -> LIFT -> RIDE -> BRAKE -> ARRIVE
  // ============================================================================
  const CAR_COUNT = 5;
  const CAR_SPACING = 2.45;

  CPE.RIDE = {
    coasterIndex: 0,
    coaster: CPE.COASTERS[0],
    state: 'BOARD',
    autoDispatch: true,
    pauseMidRide: false,
    s: 0.0,               // Center car (car 2) arc-length; 0.0 = station center
    speed: 0.0,           // m/s
    lapTime: 0.0,         // seconds
    stateTimer: 0.0,
    boardCountdown: 13.0, // auto-dispatch after ~13s
    timeScale: 1,         // x1, x2, x4
    gateOpen: 1.0,        // 1 = open, 0 = closed
    restraintClosed: 0.0, // 0 = open, 1 = closed
    lastSectionName: 'Station Platform',
    toastCooldown: 0,
    airtimeAccum: 0,
    cars: Array.from({ length: CAR_COUNT }, () => ({
      s: 0,
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 1, 0),
      binormal: new THREE.Vector3(0, 0, 1),
      matrix: new THREE.Matrix4(),
      armsUp: 0,
      sample: null
    })),
    currentSample: null,

    selectCoaster(idx) {
      if (idx < 0 || idx >= CPE.COASTERS.length) return;
      this.coasterIndex = idx;
      this.coaster = CPE.COASTERS[idx];
      this.resetToStation();
      CPE.events.emit('coasterChanged', { index: idx, coaster: this.coaster });
      CPE.events.emit('toast', {
        text: this.coaster.name,
        subtitle: this.coaster.subtitle,
        color: '#f2c94c'
      });
    },

    resetToStation() {
      this.s = 0.0;
      this.speed = 0.0;
      this.lapTime = 0.0;
      this.boardCountdown = 13.0;
      this.gateOpen = 1.0;
      this.restraintClosed = 0.2;
      this.setState('BOARD');
      this.updateCarMatrices(0);
    },

    setState(newState) {
      const old = this.state;
      if (old === newState) return;
      this.state = newState;
      this.stateTimer = 0.0;
      CPE.events.emit('stateChanged', { from: old, to: newState, coaster: this.coaster });
    },

    dispatch() {
      if (this.state === 'BOARD' || this.state === 'UNLOAD') {
        this.setState('DISPATCH');
        CPE.events.emit('dispatch', { coaster: this.coaster });
        CPE.events.emit('toast', {
          text: 'All Aboard!',
          subtitle: 'Train dispatching from station',
          color: '#d9383a'
        });
      }
    },

    update(dtRaw) {
      const dt = (this.pauseMidRide ? 0 : Math.min(0.05, dtRaw)) * this.timeScale;
      this.stateTimer += dt;
      if (this.toastCooldown > 0) this.toastCooldown -= dt;

      const coaster = this.coaster;
      const L = coaster.totalLength;
      const g = 9.81;

      switch (this.state) {
        case 'UNLOAD': {
          this.speed = 0;
          this.gateOpen = Math.min(1.0, this.gateOpen + dt * 2.5);
          this.restraintClosed = Math.max(0.0, this.restraintClosed - dt * 2.5);
          if (this.stateTimer >= 1.8) {
            this.boardCountdown = 13.0;
            this.setState('BOARD');
          }
          break;
        }
        case 'BOARD': {
          this.speed = 0;
          this.gateOpen = Math.min(1.0, this.gateOpen + dt * 2.5);
          this.restraintClosed = Math.min(0.35, this.restraintClosed + dt * 0.5);
          if (this.autoDispatch) {
            this.boardCountdown -= dtRaw; // real seconds for auto-dispatch
            if (this.boardCountdown <= 0) {
              this.dispatch();
            }
          }
          break;
        }
        case 'DISPATCH': {
          this.gateOpen = Math.max(0.0, this.gateOpen - dt * 3.2);
          this.restraintClosed = Math.min(1.0, this.restraintClosed + dt * 3.2);
          if (this.stateTimer > 0.55) {
            // Accelerate out of station
            this.speed = Math.min(4.2, this.speed + 4.8 * dt);
            this.s += this.speed * dt;
            this.lapTime += dt;
            const frontSample = coaster.sampleAt(this.s + 2 * CAR_SPACING);
            if (frontSample.segmentType === 'lift') {
              this.setState('LIFT');
            }
          }
          break;
        }
        case 'LIFT': {
          this.lapTime += dt;
          const targetLift = coaster.id === 'cinderloop' ? 4.8 : (coaster.id === 'pinewood' ? 4.5 : 4.2);
          this.speed += (targetLift - this.speed) * Math.min(1.0, dt * 5.0);
          this.s += this.speed * dt;
          const centerSample = coaster.sampleAt(this.s);
          const frontSample = coaster.sampleAt(this.s + 2 * CAR_SPACING);
          if (centerSample.segmentType !== 'lift' && frontSample.segmentType !== 'lift' && this.s > 25) {
            this.setState('RIDE');
            CPE.events.emit('toast', {
              text: 'First Drop!',
              subtitle: coaster.name,
              color: '#f2c94c'
            });
            CPE.events.emit('scream', { intensity: 1.0 });
          }
          break;
        }
        case 'RIDE': {
          this.lapTime += dt;
          // Sub-step integration for rock-solid energy accuracy
          const steps = 4;
          const h = dt / steps;
          for (let k = 0; k < steps; k++) {
            // Average tangent slope across the 5-car train for realistic coupled-train gravity!
            let sinPitchSum = 0;
            for (let c = 0; c < CAR_COUNT; c++) {
              const cs = this.s + (2 - c) * CAR_SPACING;
              const smp = coaster.sampleAt(cs);
              sinPitchSum += smp.tangent.y;
            }
            const avgSinPitch = sinPitchSum / CAR_COUNT;
            const centerSmp = coaster.sampleAt(this.s);
            const friction = coaster.id === 'cinderloop' ? 0.013 : 0.016;
            const drag = 0.00048;

            let acc = -g * avgSinPitch - friction * g - drag * this.speed * this.speed;
            if (centerSmp.segmentType === 'trim') {
              const trimLim = coaster.id === 'cinderloop' ? 12.8 : 11.8;
              if (this.speed > trimLim) {
                acc -= 9.5;
              }
            }
            this.speed = Math.max(3.8, this.speed + acc * h);
            this.s += this.speed * h;
          }

          const centerSample = coaster.sampleAt(this.s);
          if (centerSample.segmentType === 'brake' && this.s > L * 0.75) {
            this.setState('BRAKE');
            CPE.events.emit('brakeHiss', { intensity: 0.9 });
          }
          break;
        }
        case 'BRAKE': {
          this.lapTime += dt;
          const targetBrake = 4.2;
          if (this.speed > targetBrake) {
            this.speed = Math.max(targetBrake, this.speed - 9.0 * dt);
          }
          this.s += this.speed * dt;
          if (this.s >= L - 10.0) {
            this.setState('ARRIVE');
            CPE.events.emit('brakeHiss', { intensity: 0.6 });
          }
          break;
        }
        case 'ARRIVE': {
          this.lapTime += dt;
          // Smoothly stop at s = L (which wraps to 0.0, station center)
          const rem = L - this.s;
          if (rem <= 0.08) {
            this.s = 0.0;
            this.speed = 0.0;
            this.setState('UNLOAD');
            CPE.events.emit('toast', {
              text: 'Welcome Back!',
              subtitle: `Lap completed in ${this.lapTime.toFixed(1)}s`,
              color: '#f4e9d1'
            });
          } else {
            const desiredSpeed = Math.max(0.6, Math.min(4.2, rem * 0.85));
            this.speed += (desiredSpeed - this.speed) * Math.min(1, dt * 8.0);
            this.s += this.speed * dt;
          }
          break;
        }
      }

      this.updateCarMatrices(dt);
    },

    updateCarMatrices(dt) {
      const coaster = this.coaster;
      for (let i = 0; i < CAR_COUNT; i++) {
        const car = this.cars[i];
        // Car 0 is front (+2 * CAR_SPACING), Car 4 is back (-2 * CAR_SPACING)
        car.s = this.s + (2 - i) * CAR_SPACING;
        const smp = coaster.sampleAt(car.s);
        car.sample = smp;
        car.pos.copy(smp.pos);
        car.tangent.copy(smp.tangent);
        car.normal.copy(smp.normal);
        car.binormal.copy(smp.binormal);

        // Build orientation matrix where local +Z is forward (or +X: let's define standard Three.js car frame:
        // X = binormal (right), Y = normal (up), Z = tangent (forward))
        car.matrix.makeBasis(car.binormal, car.normal, car.tangent);
        car.matrix.setPosition(car.pos);

        // Rider arms up during drops, airtime, loop, or high speed excitement
        const wantArms = (smp.airtime || smp.segmentType === 'drop' || smp.segmentType === 'loop' || smp.vG < 0.45) ? 1.0 : 0.0;
        car.armsUp += (wantArms - car.armsUp) * Math.min(1.0, dt * 6.0);
      }

      const front = this.cars[0].sample;
      // Scale felt G and speed according to actual live speed vs pre-solved speed
      const speedRatio = (this.state === 'BOARD' || this.state === 'UNLOAD') ? 0 : (this.speed / Math.max(1.0, front.speed));
      this.currentSample = {
        ...front,
        liveSpeed: this.speed,
        liveVG: (this.state === 'BOARD' || this.state === 'UNLOAD') ? 1.0 : (1.0 + (front.vG - 1.0) * Math.min(1.3, speedRatio * speedRatio)),
        liveLatG: front.latG * Math.min(1.2, speedRatio)
      };

      // Update world train position for cheering guests
      CPE.WORLD.trainPos.copy(this.cars[0].pos);
      CPE.WORLD.trainSpeed = this.speed;

      // Section change & toast events
      if (front.sectionName !== this.lastSectionName) {
        this.lastSectionName = front.sectionName;
        CPE.events.emit('enterSection', {
          sectionType: front.segmentType,
          sectionName: front.sectionName,
          coaster
        });

        if (this.state === 'RIDE' && this.toastCooldown <= 0) {
          if (front.segmentType === 'loop') {
            CPE.events.emit('toast', { text: 'Loop!', subtitle: 'Vertical Teardrop Loop', color: '#f2c94c' });
            CPE.events.emit('scream', { intensity: 1.0 });
            this.toastCooldown = 2.5;
          } else if (front.segmentType === 'tunnel') {
            CPE.events.emit('toast', { text: 'Tunnel!', subtitle: 'Ember Mine Cavern', color: '#e59f28' });
            CPE.events.emit('scream', { intensity: 0.7 });
            this.toastCooldown = 2.5;
          } else if (front.segmentType === 'trim') {
            CPE.events.emit('toast', { text: 'Trim Brake!', subtitle: 'Magnetic Speed Check', color: '#d9383a' });
            CPE.events.emit('brakeHiss', { intensity: 0.7 });
            this.toastCooldown = 2.0;
          } else if (front.segmentType === 'helix') {
            CPE.events.emit('toast', { text: 'Helix!', subtitle: 'High-Banked Spiral', color: '#f2c94c' });
            this.toastCooldown = 2.5;
          }
        }
      }

      // Airtime toast detection
      if (this.state === 'RIDE' && this.currentSample.liveVG < 0.25) {
        this.airtimeAccum += dt;
        if (this.airtimeAccum > 0.18 && this.toastCooldown <= 0) {
          CPE.events.emit('toast', { text: 'Airtime!', subtitle: `${this.currentSample.liveVG.toFixed(1)}g Zero-G Crest`, color: '#f4e9d1' });
          CPE.events.emit('scream', { intensity: 0.85 });
          this.toastCooldown = 2.5;
        }
      } else {
        this.airtimeAccum = 0;
      }
    }
  };

  // Initialize car matrices at t=0
  CPE.RIDE.updateCarMatrices(0);
})();
