// ============================================================================
// Cinderpine Express: One More Ride — Story, Character Controller, NPCs & UI
// ============================================================================
// Implements Chapter One of "Cinderpine Express: One More Ride":
// 1. Character Selection (Maya, Noah, Alex) with pixel-art portraits & local save
// 2. 3D Articulated Character Models & Park Exploration (WASD/Arrows + Mobile Joystick)
// 3. Obstacle Collision & Context-Sensitive Interaction System (E / Enter / Tap)
// 4. Character-Specific Opening Objectives & Pre-Ride Conversations
// 5. Boarding Old Pinewood Together, Mid-Ride Choice on the Chain Lift, & Post-Ride Scene
// 6. Chapter One Complete Screen with Next-Destination Vote & Free Roam / New Game
// ============================================================================
(function () {
  'use strict';

  const CPE = (window.CPE = window.CPE || {});
  const SAVE_KEY = 'cpe_one_more_ride_save_v1';

  // --------------------------------------------------------------------------
  // 1. CHARACTER DEFINITIONS
  // --------------------------------------------------------------------------
  const CHARACTERS = {
    maya: {
      id: 'maya',
      name: 'Maya',
      role: 'The Younger Sister',
      age: '19',
      coatHex: 0xd9383a,   // Cherry red coat
      scarfHex: 0xf2c94c,  // Gold knit scarf
      pantsHex: 0x2b3642,  // Dark denim
      skinHex: 0xe3b488,
      hairHex: 0x2a1810,
      hatStyle: 'beanie',  // Gold pom-pom beanie
      accentHex: '#d9383a',
      badgeColor: '#f2c94c',
      tagline: 'Came back to bridge the quiet distance that grew between her and her brother.',
      description:
        'Since starting college upstate, Maya and her older brother Noah have mostly talked in short texts. On the final evening of Cinderpine’s autumn season, she wants more than polite small talk—she wants her brother back.',
      startPos: { x: -34.5, z: 25.0, yaw: 0.2 }, // Near Entrance Gate
      npcPos: { x: -19.5, z: 13.5, yaw: -0.7 },  // Viewing fence / midway lantern when NPC
      openingObjective: 'Find Noah or Alex along the midway and meet at the Grand Station for Old Pinewood.',
      keepsakeLabel: 'Folded Park Map (2018)'
    },
    noah: {
      id: 'noah',
      name: 'Noah',
      role: 'The Older Brother',
      age: '23',
      coatHex: 0x367a82,   // Teal work jacket
      scarfHex: 0xf4e9d1,  // Cream collar/flannel
      pantsHex: 0x472918,  // Brown work trousers
      skinHex: 0xe3b488,
      hairHex: 0x3b2416,
      hatStyle: 'cap',     // Dark slate cap
      accentHex: '#397d8a',
      badgeColor: '#61b4c2',
      tagline: 'Cares deeply for Maya and Alex, even when he hides behind practical details.',
      description:
        'Noah bought three paper ride tickets an hour early and has been smoothing their corners in his coat pocket. He doesn’t always know how to say he missed someone, so he hopes Old Pinewood will say it for him.',
      startPos: { x: -16.5, z: 23.0, yaw: 1.5 }, // South promenade near queue
      npcPos: { x: -7.5, z: 22.0, yaw: -1.4 },   // Waiting by the Old Pinewood queue entrance
      openingObjective: 'Hold onto the group’s paper tickets, check in with Alex or Maya, and meet at the Grand Station.',
      keepsakeLabel: 'Three Paper Tickets'
    },
    alex: {
      id: 'alex',
      name: 'Alex',
      role: 'The Childhood Friend',
      age: '21',
      coatHex: 0xe59f28,   // Ochre/Gold autumn corduroy jacket
      scarfHex: 0x9e3b2b,  // Brick-red scarf
      pantsHex: 0x2b3642,
      skinHex: 0xc99268,
      hairHex: 0x1e1815,
      hatStyle: 'curls',   // Textured curls + brass camera strap
      accentHex: '#e59f28',
      badgeColor: '#f7ce45',
      tagline: 'Brought a 2016 photo strip and hopes tonight feels like the old days.',
      description:
        'Every October when they were kids, it was the three of them racing from the cider stall to the front row of Old Pinewood. Alex is carrying a creased photo-booth strip from ten years ago, wondering if they still fit in the same frame.',
      startPos: { x: -30.5, z: 12.0, yaw: -0.3 }, // Near Fountain & Cafe plaza
      npcPos: { x: -23.5, z: 8.5, yaw: 0.4 },     // Between Fountain and Cider Stall
      openingObjective: 'Share the 2016 photo-strip keepsake with Maya or Noah, then head to the Grand Station.',
      keepsakeLabel: '2016 Photo-Booth Strip'
    }
  };

  // --------------------------------------------------------------------------
  // 2. PARK COLLISION OBSTACLES & BOUNDARIES
  // --------------------------------------------------------------------------
  // Prevents player from walking through buildings, stalls, fountain, rides, or off the island
  const OBSTACLE_CIRCLES = [
    { x: -27.0, z: 8.0, r: 3.65, name: 'Central Fountain' },
    { x: -25.0, z: -22.0, r: 5.2, name: 'Carousel' },
    // Cafe patio umbrella tables
    { x: -31.2, z: 4.8, r: 1.35 },
    { x: -31.2, z: 8.0, r: 1.35 },
    { x: -31.2, z: 11.2, r: 1.35 },
    { x: -34.8, z: 13.6, r: 1.35 },
    // Entrance gate brick pillars
    { x: -42.4, z: 28.0, r: 1.15 },
    { x: -33.6, z: 28.0, r: 1.15 }
  ];

  const OBSTACLE_BOXES = [
    // Cinder Hearth Cafe building
    { minX: -43.2, maxX: -32.8, minZ: 4.0, maxZ: 12.0 },
    // Ferris Wheel deck
    { minX: -42.0, maxX: -34.0, minZ: -16.8, maxZ: -11.2 },
    // 6 Fairground Stalls
    { minX: -32.0, maxX: -28.0, minZ: 24.4, maxZ: 27.6 }, // Ticket booth
    { minX: -20.6, maxX: -17.2, minZ: 8.1, maxZ: 11.9 },  // Popcorn stall
    { minX: -20.6, maxX: -17.2, minZ: 0.1, maxZ: 3.9 },   // Cider stall
    { minX: -20.6, maxX: -17.2, minZ: -7.9, maxZ: -4.1 }, // Ring toss
    { minX: -20.6, maxX: -17.2, minZ: -15.9, maxZ: -12.1 }, // Candy apple
    { minX: -32.0, maxX: -28.0, minZ: -21.6, maxZ: -18.4 }, // Balloon stall
    // Coaster Viewing Fence along X = -12.8, Z in [-12.5, 15.2]
    { minX: -13.3, maxX: -12.1, minZ: -12.5, maxZ: 15.2 },
    // Grand Station raised masonry footprint (player walks up to the south stairs/queue at Z = 17.8)
    { minX: -9.8, maxX: 7.8, minZ: 10.0, maxZ: 17.75 },
    // Coaster track safety perimeter East of station
    { minX: -12.2, maxX: 52.0, minZ: -36.0, maxZ: 15.2 }
  ];

  function resolvePlayerCollision(pos) {
    // 1. Keep on walkable island plaza/midway bounds
    pos.x = Math.max(-46.5, Math.min(12.0, pos.x));
    pos.z = Math.max(-29.0, Math.min(31.0, pos.z));

    // 2. Circle obstacles
    for (let i = 0; i < OBSTACLE_CIRCLES.length; i++) {
      const c = OBSTACLE_CIRCLES[i];
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < c.r && dist > 0.0001) {
        const push = (c.r - dist);
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      }
    }

    // 3. Axis-aligned box obstacles
    const playerRadius = 0.45;
    for (let i = 0; i < OBSTACLE_BOXES.length; i++) {
      const b = OBSTACLE_BOXES[i];
      const minX = b.minX - playerRadius;
      const maxX = b.maxX + playerRadius;
      const minZ = b.minZ - playerRadius;
      const maxZ = b.maxZ + playerRadius;

      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const dLeft = pos.x - minX;
        const dRight = maxX - pos.x;
        const dTop = pos.z - minZ;
        const dBottom = maxZ - pos.z;
        const m = Math.min(dLeft, dRight, dTop, dBottom);
        if (m === dLeft) pos.x = minX;
        else if (m === dRight) pos.x = maxX;
        else if (m === dTop) pos.z = minZ;
        else pos.z = maxZ;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. 3D PIXEL-ART CHARACTER BUILDER (Player + Companion NPCs + Marker)
  // --------------------------------------------------------------------------
  function buildCharacterAvatar(charDef, isPlayer) {
    const group = new THREE.Group();
    group.name = 'Character_' + charDef.id;

    const makeM = (hex, opts) =>
      CPE.makeMat ? CPE.makeMat(hex, opts) : new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...opts });

    const coatMat = makeM(charDef.coatHex);
    const scarfMat = makeM(charDef.scarfHex);
    const pantsMat = makeM(charDef.pantsHex);
    const skinMat = makeM(charDef.skinHex);
    const hairMat = makeM(charDef.hairHex);
    const bootMat = makeM(0x231712);

    // Subtle ground ring under character so they stand out in the busy fairground
    const ringHex = isPlayer ? 0xf2c94c : 0xf4e9d1;
    const ringMat = CPE.registerGlowMaterial
      ? CPE.registerGlowMaterial(
          new THREE.MeshLambertMaterial({ color: ringHex, emissive: ringHex, emissiveIntensity: 0.55, flatShading: true }),
          ringHex,
          0.55,
          1.0
        )
      : makeM(ringHex);
    const ringGeo = new THREE.CylinderGeometry(0.46, 0.50, 0.04, 12);
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.025;
    group.add(ringMesh);

    // Body root that bobs during walking
    const bodyRoot = new THREE.Group();
    group.add(bodyRoot);

    // Left & Right Legs
    const legGeo = new THREE.BoxGeometry(0.15, 0.42, 0.16);
    legGeo.translate(0, -0.21, 0);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.10, 0.44, 0);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.10, 0.44, 0);
    bodyRoot.add(leftLeg, rightLeg);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.16, 0.10, 0.20);
    const bootL = new THREE.Mesh(bootGeo, bootMat);
    bootL.position.set(0, -0.39, 0.02);
    leftLeg.add(bootL);
    const bootR = bootL.clone();
    rightLeg.add(bootR);

    // Torso / Coat
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.24), coatMat);
    torso.position.set(0, 0.66, 0);
    torso.castShadow = true;
    bodyRoot.add(torso);

    // Scarf / Collar
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.10, 0.27), scarfMat);
    scarf.position.set(0, 0.89, 0.01);
    bodyRoot.add(scarf);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.94, 0);
    bodyRoot.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skinMat);
    head.position.set(0, 0.14, 0);
    head.castShadow = true;
    headGroup.add(head);

    // Eyes (facing +Z)
    const eyeMat = makeM(0x161121);
    const eyeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.02);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.06, 0.15, 0.145);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.06, 0.15, 0.145);
    headGroup.add(eyeL, eyeR);

    // Hair & Hat per character
    if (charDef.hatStyle === 'beanie') {
      const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.12), hairMat);
      hairBack.position.set(0, 0.12, -0.10);
      const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.30), scarfMat);
      beanie.position.set(0, 0.29, 0);
      const pom = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), makeM(0xf4e9d1));
      pom.position.set(0, 0.38, 0);
      headGroup.add(hairBack, beanie, pom);
    } else if (charDef.hatStyle === 'cap') {
      const capMat = makeM(0x2b3642);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.10, 0.30), capMat);
      crown.position.set(0, 0.28, 0);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.12), capMat);
      visor.position.set(0, 0.24, 0.18);
      headGroup.add(crown, visor);
    } else {
      // Alex: textured curls + camera slung over chest
      const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.11, 0.31), hairMat);
      hairTop.position.set(0, 0.29, 0);
      const hairSide = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.22), hairMat);
      hairSide.position.set(0, 0.19, -0.05);
      headGroup.add(hairTop, hairSide);

      const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.10), makeM(0x2b3642));
      camBox.position.set(0, 0.65, 0.15);
      bodyRoot.add(camBox);
    }

    // Left & Right Arms
    const armGeo = new THREE.BoxGeometry(0.12, 0.38, 0.12);
    armGeo.translate(0, -0.17, 0);
    const leftArm = new THREE.Mesh(armGeo, coatMat);
    leftArm.position.set(-0.25, 0.85, 0);
    const rightArm = new THREE.Mesh(armGeo, coatMat);
    rightArm.position.set(0.25, 0.85, 0);
    bodyRoot.add(leftArm, rightArm);

    // Floating overhead diamond marker for player or interactable companion
    const markerGeo = new THREE.OctahedronGeometry(isPlayer ? 0.16 : 0.14, 0);
    const markerColor = isPlayer ? 0xf2c94c : 0xd9383a;
    const markerMat = CPE.registerGlowMaterial
      ? CPE.registerGlowMaterial(
          new THREE.MeshLambertMaterial({ color: markerColor, emissive: markerColor, emissiveIntensity: 0.75, flatShading: true }),
          markerColor,
          0.75,
          1.0
        )
      : makeM(markerColor);
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(0, 1.68, 0);
    group.add(marker);

    return {
      id: charDef.id,
      group,
      bodyRoot,
      headGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      marker,
      ringMesh,
      walkPhase: 0
    };
  }

  function animateAvatar(avatar, speed, dt, elapsed, isTalking) {
    if (!avatar) return;
    avatar.marker.position.y = 1.66 + Math.sin(elapsed * 3.8) * 0.08;
    avatar.marker.rotation.y = elapsed * 2.2;

    if (speed > 0.15) {
      avatar.walkPhase += speed * dt * 3.4;
      const swing = Math.sin(avatar.walkPhase) * 0.65;
      avatar.leftLeg.rotation.x = swing;
      avatar.rightLeg.rotation.x = -swing;
      avatar.leftArm.rotation.x = -swing * 0.8;
      avatar.rightArm.rotation.x = swing * 0.8;
      avatar.bodyRoot.position.y = Math.abs(Math.sin(avatar.walkPhase)) * 0.06;
    } else {
      avatar.leftLeg.rotation.x *= 0.82;
      avatar.rightLeg.rotation.x *= 0.82;
      avatar.bodyRoot.position.y = Math.sin(elapsed * 2.4) * 0.015;
      if (isTalking) {
        avatar.leftArm.rotation.x = -0.35 + Math.sin(elapsed * 6.5) * 0.22;
        avatar.rightArm.rotation.x = -0.25 + Math.cos(elapsed * 5.5) * 0.18;
      } else {
        avatar.leftArm.rotation.x *= 0.82;
        avatar.rightArm.rotation.x *= 0.82;
      }
    }
  }

  // 3D glowing beacon over key park hotspots
  function buildHotspotBeacon(x, y, z, hexColor) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mat = CPE.registerGlowMaterial
      ? CPE.registerGlowMaterial(
          new THREE.MeshLambertMaterial({ color: hexColor, emissive: hexColor, emissiveIntensity: 0.7, flatShading: true }),
          hexColor,
          0.7,
          1.0
        )
      : new THREE.MeshLambertMaterial({ color: hexColor, flatShading: true });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), mat);
    g.add(gem);
    return g;
  }

  // --------------------------------------------------------------------------
  // 4. DIALOGUE & STORY CONTENT (Perspective-Aware for Maya, Noah, and Alex)
  // --------------------------------------------------------------------------
  const RIDE_CHOICES = {
    nostalgia: {
      id: 'nostalgia',
      label: '“Look at the midway lanterns—some things really don’t change.”',
      tone: 'Holding onto the shared past'
    },
    honesty: {
      id: 'honesty',
      label: '“I’m sorry it took the final night of the season for us to do this again.”',
      tone: 'Bridging the quiet distance'
    },
    present: {
      id: 'present',
      label: '“Hands up on the drop! Let’s make a new front-row memory right now!”',
      tone: 'Embracing who we are tonight'
    }
  };

  function getCompanionEncounterLines(playerChar, npcChar, state) {
    const pair = `${playerChar}_${npcChar}`;
    state.talkedTo[npcChar] = true;

    if (pair === 'maya_noah') {
      state.metRequiredCompanion = true;
      return [
        { speaker: 'Noah', role: 'The Older Brother', text: '“Hey, May. You actually made it before the eight o’clock bell.”' },
        { speaker: 'Maya', role: 'The Younger Sister', text: '“Of course I did. You texted me the weather forecast three times today, Noah.”' },
        { speaker: 'Noah', role: 'The Older Brother', text: '“Lake wind gets cold on the lift hill! Here—I kept three paper tickets for Old Pinewood. Just like when Dad used to measure us against the timber post.”' },
        { speaker: 'Maya', role: 'The Younger Sister', text: '“You still fold the corners when you’re nervous. Come on—let’s head up the Grand Station stairs whenever you’re ready.”' }
      ];
    }
    if (pair === 'maya_alex') {
      state.metRequiredCompanion = true;
      return [
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“Maya! Look what I dug out of my desk drawer before catching the ferry.”' },
        { speaker: 'Maya', role: 'The Younger Sister', text: '“No way—is that the 2016 photo-booth strip? Look at Noah’s missing tooth and your oversized cider mug!”' },
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“Ten autumns ago. I was worried tonight might feel awkward after how busy everyone’s been, but standing here under the bunting... it still feels like us.”' },
        { speaker: 'Maya', role: 'The Younger Sister', text: '“Noah’s waiting over by the Old Pinewood queue entrance. Let’s go meet him at the station.”' }
      ];
    }
    if (pair === 'noah_maya') {
      state.metRequiredCompanion = true;
      return [
        { speaker: 'Maya', role: 'The Younger Sister', text: '“There you are! I spotted your teal jacket from the entrance arch.”' },
        { speaker: 'Noah', role: 'The Older Brother', text: '“I grabbed our Old Pinewood tickets before the line backed up. I wasn’t sure if you’d be too tired from midterms to ride.”' },
        { speaker: 'Maya', role: 'The Younger Sister', text: '“Noah, I didn’t take the train all the way back to watch from the fence. I missed hanging out with you.”' },
        { speaker: 'Noah', role: 'The Older Brother', text: '“Yeah. Me too, May. Let’s head to the Grand Station boarding stairs whenever we’re ready.”' }
      ];
    }
    if (pair === 'noah_alex') {
      state.metRequiredCompanion = true;
      return [
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“Ticket master Noah! Still guarding the itinerary like it’s a state secret?”' },
        { speaker: 'Noah', role: 'The Older Brother', text: '“Somebody had to make sure we got the last dusk run on Old Pinewood. What’s that in your hand?”' },
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“Our 2016 photo strip. Back when our biggest worry was whether we’d clear the 48-inch height bar.”' },
        { speaker: 'Noah', role: 'The Older Brother', text: '“Keep that safe—we’re taking an updated one tonight. Meet me and Maya at the Grand Station stairs.”' }
      ];
    }
    if (pair === 'alex_maya') {
      state.metRequiredCompanion = true;
      return [
        { speaker: 'Maya', role: 'The Younger Sister', text: '“Alex! You brought the old camera—and wait, is that the 2016 photo strip?”' },
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“Found it tucked inside an old paperback. Three kids squinting into the flash with cinnamon sugar on their sleeves.”' },
        { speaker: 'Maya', role: 'The Younger Sister', text: '“Noah’s been hovering near the station queue pretending he isn’t emotional about the season closing tonight. Showing him this will definitely crack his serious face.”' },
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“Let’s go catch him at the Grand Station and board Old Pinewood.”' }
      ];
    }
    if (pair === 'alex_noah') {
      state.metRequiredCompanion = true;
      return [
        { speaker: 'Noah', role: 'The Older Brother', text: '“Alex! Right on time. I’ve got three stamped cream tickets for Old Pinewood right here.”' },
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“And I brought proof of our rookie coaster years—look at this 2016 photo strip.”' },
        { speaker: 'Noah', role: 'The Older Brother', text: '“Man... look how small Maya was. I’ve been wanting to talk to her all week, I just kept overthinking what to say.”' },
        { speaker: 'Alex', role: 'The Childhood Friend', text: '“You don’t need a speech, Noah. You bought the tickets and showed up. Let’s meet at the Grand Station stairs.”' }
      ];
    }
    return [];
  }

  function getPostRideConversation(playerChar, choiceId) {
    const c = choiceId || 'present';
    const pName = CHARACTERS[playerChar].name;

    const introByChar = {
      maya: {
        speaker: 'Maya',
        role: 'The Younger Sister',
        text: 'Stepping off the timber platform, my knees are still buzzing from the final helix—and for the first time in months, Noah is laughing out loud.'
      },
      noah: {
        speaker: 'Noah',
        role: 'The Older Brother',
        text: 'As the brass air-gates swing open, the tightness in my shoulders is gone. Maya’s scarf is half-unwrapped from the camelback airtime hill, and Alex is grinning ear to ear.'
      },
      alex: {
        speaker: 'Alex',
        role: 'The Childhood Friend',
        text: 'The pine trestles creak behind us as the train rolls back into the station. Looking at Maya and Noah under the warm amber lanterns, the ten years between my photo strip and tonight suddenly feel paper-thin.'
      }
    }[playerChar];

    const choiceBranch = {
      nostalgia: [
        {
          speaker: 'Alex',
          role: 'The Childhood Friend',
          text: '“When you pointed out the midway lanterns on the lift hill, ${pName}, it hit me—the park didn’t shrink. We just grew up.”'.replace('${pName}', pName)
        },
        {
          speaker: 'Noah',
          role: 'The Older Brother',
          text: '“Same creaky third bent on the first drop, same smell of roasted chestnuts drifting up from the plaza. Some anchors stay put even when we’re all in different cities.”'
        },
        {
          speaker: 'Maya',
          role: 'The Younger Sister',
          text: '“And the park reopens next spring. We don’t have to mourn the old days if we keep showing up for the new ones.”'
        }
      ],
      honesty: [
        {
          speaker: 'Noah',
          role: 'The Older Brother',
          text: '“What you said on the lift hill meant a lot. I’m sorry I let work and distance turn into silence this year.”'
        },
        {
          speaker: 'Maya',
          role: 'The Younger Sister',
          text: '“Phones work both ways, Noah. Neither of us has to wait for the final night of the season just to say we miss each other.”'
        },
        {
          speaker: 'Alex',
          role: 'The Childhood Friend',
          text: '“Hear, hear. Deal’s official: no more six-month radio silences between Cinderpine trips.”'
        }
      ],
      present: [
        {
          speaker: 'Maya',
          role: 'The Younger Sister',
          text: '“Throwing our hands up over that camelback hill felt even better than when we were ten! Did you hear Noah yell on the helix?”'
        },
        {
          speaker: 'Noah',
          role: 'The Older Brother',
          text: '“That was a tactical exhale for G-force management, thank you very much.”'
        },
        {
          speaker: 'Alex',
          role: 'The Childhood Friend',
          text: '“Sure it was! Honestly, I spent all week missing how things used to be—but riding with the two of you right now beats nostalgia every time.”'
        }
      ]
    }[c];

    const closing = [
      {
        speaker: 'Noah',
        role: 'The Older Brother',
        text: '“The autumn lights are coming on across the island, and we’ve still got the whole evening ahead of us. Where should we head next?”',
        isNextStopPrompt: true
      }
    ];

    return [introByChar, ...choiceBranch, ...closing];
  }

  // --------------------------------------------------------------------------
  // 5. MAIN STORY & EXPLORATION ENGINE (CPE.STORY)
  // --------------------------------------------------------------------------
  CPE.STORY = {
    initialized: false,
    mode: 'SELECT', // 'SELECT' | 'EXPLORE' | 'DIALOGUE' | 'RIDING' | 'RIDE_CHOICE' | 'POST_RIDE' | 'COMPLETE'
    selectedChar: null,
    playerPos: new THREE.Vector3(-34, 0, 25),
    playerYaw: 0,
    playerSpeed: 0,

    // Story flags
    talkedTo: { maya: false, noah: false, alex: false },
    inspectedHotspots: {},
    metRequiredCompanion: false,
    boardedPinewood: false,
    rideChoicePrompted: false,
    rideChoiceMade: null,
    nextStopChoice: null,
    chapterCompleted: false,

    // 3D objects
    storyGroup: null,
    playerAvatar: null,
    npcAvatars: {},
    hotspots: [],
    activeInteractable: null,

    // Input state (WASD / Arrows + Touch Joystick)
    keys: { up: false, down: false, left: false, right: false },
    joyVec: { x: 0, y: 0, active: false },

    // Active dialogue queue
    dialogueQueue: [],
    dialogueIndex: 0,
    dialogueCallback: null,
    rideChoiceTimer: 0,

    init(scene) {
      if (this.initialized) return;
      this.initialized = true;
      this.scene = scene;

      this.storyGroup = new THREE.Group();
      this.storyGroup.name = 'OneMoreRideStoryGroup';
      scene.add(this.storyGroup);

      this.buildParkHotspots();
      this.buildStoryUI();
      this.bindInputListeners();
      this.bindRideEvents();

      // Check for saved game in localStorage
      const saved = this.loadSave();
      this.renderCharSelectOverlay(saved);
    },

    isFollowingPlayer() {
      return (
        this.selectedChar &&
        (this.mode === 'EXPLORE' || this.mode === 'DIALOGUE' || this.mode === 'COMPLETE') &&
        CPE.RENDER &&
        CPE.RENDER.cameraMode === 'park'
      );
    },

    // ------------------------------------------------------------------------
    // Park Interactive Hotspots (Stalls, Sign, Cafe, Station Boarding Gate)
    // ------------------------------------------------------------------------
    buildParkHotspots() {
      this.hotspots = [
        {
          id: 'station_board',
          x: -7.2,
          z: 19.6,
          radius: 3.6,
          title: 'Grand Station Boarding Stairs',
          getPrompt: () => {
            if (this.chapterCompleted) return 'Ride Coaster Again';
            return this.metRequiredCompanion
              ? 'Board Old Pinewood Together'
              : 'Board Old Pinewood (or talk to friends first)';
          },
          onInteract: () => this.handleStationInteract()
        },
        {
          id: 'cider_stall',
          x: -21.5,
          z: 2.0,
          radius: 3.0,
          title: 'Spiced Cider & Cocoa Stall',
          getPrompt: () => 'Check Warm Cider Stall',
          onInteract: () => {
            this.inspectedHotspots.cider = true;
            const linesByChar = {
              maya: [
                { speaker: 'Maya', role: 'Memory — Spiced Cider Stall', text: 'Cinnamon steam curls into the crisp evening air. Whenever I spilled my cup as a kid, Noah would quietly trade his full one for mine without making a big deal of it.' }
              ],
              noah: [
                { speaker: 'Noah', role: 'Memory — Spiced Cider Stall', text: 'Two dollars for a paper cup of hot mulled cider. Maya always insisted on extra cinnamon sticks even though she never finished half of it.' }
              ],
              alex: [
                { speaker: 'Alex', role: 'Memory — Spiced Cider Stall', text: 'The brass cider urn still has the exact same dent on the side! This is where we stood for the 2016 photo strip with sugared donuts.' }
              ]
            };
            this.startDialogue(linesByChar[this.selectedChar || 'maya']);
          }
        },
        {
          id: 'height_board',
          x: -11.2,
          z: 25.3,
          radius: 2.8,
          title: 'Old Pinewood Height Post',
          getPrompt: () => 'Inspect Timber Height Post',
          onInteract: () => {
            this.inspectedHotspots.height_board = true;
            this.startDialogue([
              {
                speaker: CHARACTERS[this.selectedChar || 'maya'].name,
                role: 'Old Pinewood Queue Entrance',
                text: 'Carved notches in the timber post mark decades of autumn seasons. Near the 48-inch brass line, three faded pencil initials—M, N, and A—are still barely visible under the varnish.'
              }
            ]);
          }
        },
        {
          id: 'fountain_plaza',
          x: -27.0,
          z: 12.6,
          radius: 3.0,
          title: 'Central Wishing Fountain',
          getPrompt: () => 'Look into Wishing Fountain',
          onInteract: () => {
            this.inspectedHotspots.fountain = true;
            this.startDialogue([
              {
                speaker: CHARACTERS[this.selectedChar || 'maya'].name,
                role: 'Central Plaza Fountain',
                text: 'Copper pennies glint beneath the jumping water arcs. On the last night of the season, guests toss a coin so they’ll find their way back next autumn.'
              }
            ]);
          }
        },
        {
          id: 'hearth_cafe',
          x: -33.2,
          z: 8.0,
          radius: 3.2,
          title: 'The Cinder Hearth Café Patio',
          getPrompt: () => 'Look at Café Patio',
          onInteract: () => {
            this.inspectedHotspots.cafe = true;
            this.startDialogue([
              {
                speaker: CHARACTERS[this.selectedChar || 'maya'].name,
                role: 'The Cinder Hearth Café',
                text: 'Warm fireplace smoke drifts from the brick chimney, and pumpkin-spice pastries line the glowing window panes. A great spot to sit and talk after riding Old Pinewood.'
              }
            ]);
          }
        }
      ];

      // Add subtle glowing 3D beacons over hotspots
      this.hotspots.forEach((h) => {
        const col = h.id === 'station_board' ? 0xf2c94c : 0x61b4c2;
        const beacon = buildHotspotBeacon(h.x, h.id === 'station_board' ? 2.2 : 1.4, h.z, col);
        this.storyGroup.add(beacon);
        h.beacon = beacon;
      });
    },

    // ------------------------------------------------------------------------
    // Select Character & Spawn 3D Player + Companion NPCs
    // ------------------------------------------------------------------------
    selectCharacter(charId, fromSaveData) {
      if (!CHARACTERS[charId]) charId = 'maya';
      this.selectedChar = charId;
      const def = CHARACTERS[charId];

      // Clear previous avatars
      if (this.playerAvatar) {
        this.storyGroup.remove(this.playerAvatar.group);
        this.playerAvatar = null;
      }
      Object.keys(this.npcAvatars).forEach((k) => {
        this.storyGroup.remove(this.npcAvatars[k].group);
      });
      this.npcAvatars = {};

      // Set dusk mood by default on the final evening of the autumn season
      if (CPE.RENDER && !fromSaveData) {
        CPE.RENDER.setTimeOfDay('dusk');
        if (CPE.UI && CPE.UI.syncTodButtons) CPE.UI.syncTodButtons();
      }

      // Ensure Old Pinewood (coaster 0) is selected and waiting at station
      if (CPE.RIDE) {
        CPE.RIDE.selectCoaster(0);
        CPE.RIDE.autoDispatch = false; // Wait for the group to board in story mode!
        CPE.RIDE.resetToStation();
      }

      // Build player avatar
      this.playerAvatar = buildCharacterAvatar(def, true);
      this.playerPos.set(def.startPos.x, 0, def.startPos.z);
      this.playerYaw = def.startPos.yaw || 0;
      this.playerAvatar.group.position.copy(this.playerPos);
      this.playerAvatar.group.rotation.y = this.playerYaw;
      this.storyGroup.add(this.playerAvatar.group);

      // Build the other two characters as interactive companion NPCs in the park
      Object.keys(CHARACTERS).forEach((otherId) => {
        if (otherId === charId) return;
        const otherDef = CHARACTERS[otherId];
        const npc = buildCharacterAvatar(otherDef, false);
        npc.pos = new THREE.Vector3(otherDef.npcPos.x, 0, otherDef.npcPos.z);
        npc.yaw = otherDef.npcPos.yaw || 0;
        npc.group.position.copy(npc.pos);
        npc.group.rotation.y = npc.yaw;
        this.storyGroup.add(npc.group);
        this.npcAvatars[otherId] = npc;
      });

      // Restore or initialize progress
      if (fromSaveData) {
        this.talkedTo = fromSaveData.talkedTo || { maya: false, noah: false, alex: false };
        this.metRequiredCompanion = !!fromSaveData.metRequiredCompanion;
        this.rideChoiceMade = fromSaveData.rideChoiceMade || null;
        this.nextStopChoice = fromSaveData.nextStopChoice || null;
        this.chapterCompleted = !!fromSaveData.chapterCompleted;
        if (fromSaveData.playerPos) {
          this.playerPos.set(fromSaveData.playerPos.x, 0, fromSaveData.playerPos.z);
          this.playerAvatar.group.position.copy(this.playerPos);
        }
      } else {
        this.talkedTo = { maya: false, noah: false, alex: false };
        this.metRequiredCompanion = false;
        this.boardedPinewood = false;
        this.rideChoicePrompted = false;
        this.rideChoiceMade = null;
        this.nextStopChoice = null;
        this.chapterCompleted = false;
      }

      // Focus camera nicely on the player in Park mode
      if (CPE.RENDER) {
        CPE.RENDER.setCameraMode('park');
        CPE.RENDER.isoZoomTarget = 24;
        CPE.RENDER.isoTarget.copy(this.playerPos);
        if (CPE.UI && CPE.UI.syncCameraButtons) CPE.UI.syncCameraButtons();
      }

      // Hide Character Selection Overlay
      const overlay = document.getElementById('omr-select-overlay');
      if (overlay) overlay.classList.add('hidden');

      this.mode = 'EXPLORE';
      this.updateObjectiveBanner();
      this.saveProgress();

      // Short opening inner monologue on fresh game
      if (!fromSaveData) {
        const openingLines = {
          maya: [
            {
              speaker: 'Maya',
              role: 'Final Evening of the Season',
              text: 'The ferries leave at ten, and the autumn lanterns are just starting to glow. Noah said he’d be waiting near the Old Pinewood queue—and Alex is somewhere around the plaza too.'
            }
          ],
          noah: [
            {
              speaker: 'Noah',
              role: 'Final Evening of the Season',
              text: 'Three cream tickets for Old Pinewood in my coat pocket. Alex is over by the fountain plaza, and Maya should be walking in through the main gate right about now.'
            }
          ],
          alex: [
            {
              speaker: 'Alex',
              role: 'Final Evening of the Season',
              text: 'One last evening before Cinderpine closes for the winter. I’ve got our 2016 photo-booth strip in my pocket—let’s find Maya or Noah and head for the Grand Station.'
            }
          ]
        };
        this.startDialogue(openingLines[charId]);
      }
    },

    // ------------------------------------------------------------------------
    // Objective Banner & Save State
    // ------------------------------------------------------------------------
    getCurrentObjectiveText() {
      if (!this.selectedChar) return '';
      const def = CHARACTERS[this.selectedChar];
      if (this.chapterCompleted) {
        return `Chapter One Complete — Free Roam (Next stop: ${this.nextStopChoice || 'Exploring Cinderpine'})`;
      }
      if (this.mode === 'RIDING' || this.mode === 'RIDE_CHOICE') {
        return 'Ride Old Pinewood with Maya, Noah & Alex (Drag to look around, or press 1–4 for cameras)';
      }
      if (!this.metRequiredCompanion) {
        return def.openingObjective;
      }
      return 'Head to the Grand Station boarding stairs (gold beacon) to ride Old Pinewood together!';
    },

    updateObjectiveBanner() {
      const charBadge = document.getElementById('omr-char-badge');
      const objText = document.getElementById('omr-obj-text');
      const keepsakeEl = document.getElementById('omr-keepsake-pill');
      if (!this.selectedChar) return;
      const def = CHARACTERS[this.selectedChar];
      if (charBadge) {
        charBadge.textContent = def.name.toUpperCase();
        charBadge.style.background = def.accentHex;
      }
      if (objText) {
        objText.textContent = this.getCurrentObjectiveText();
      }
      if (keepsakeEl) {
        keepsakeEl.textContent = `🎒 ${def.keepsakeLabel}`;
      }
    },

    saveProgress() {
      if (!this.selectedChar) return;
      try {
        const data = {
          selectedChar: this.selectedChar,
          talkedTo: this.talkedTo,
          metRequiredCompanion: this.metRequiredCompanion,
          rideChoiceMade: this.rideChoiceMade,
          nextStopChoice: this.nextStopChoice,
          chapterCompleted: this.chapterCompleted,
          playerPos: { x: +this.playerPos.x.toFixed(2), z: +this.playerPos.z.toFixed(2) },
          timestamp: Date.now()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch (e) {}
    },

    loadSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.selectedChar && CHARACTERS[parsed.selectedChar]) {
          return parsed;
        }
      } catch (e) {}
      return null;
    },

    clearSaveAndRestart() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (e) {}
      const completeModal = document.getElementById('omr-complete-modal');
      if (completeModal) completeModal.classList.add('hidden');
      const selectOverlay = document.getElementById('omr-select-overlay');
      if (selectOverlay) {
        this.renderCharSelectOverlay(null);
        selectOverlay.classList.remove('hidden');
      }
      this.mode = 'SELECT';
    },

    // ------------------------------------------------------------------------
    // Station Boarding, Ride Sequence, Mid-Ride Choice & Post-Ride Scene
    // ------------------------------------------------------------------------
    handleStationInteract() {
      const otherIds = Object.keys(CHARACTERS).filter((id) => id !== this.selectedChar);
      const c1 = CHARACTERS[otherIds[0]].name;
      const c2 = CHARACTERS[otherIds[1]].name;

      // Note: Even if the player skipped talking to companions on the midway, we don't punish them—
      // the companions jog over to the station stairs to meet them so the chapter can always be completed!
      const preBoardLines = this.metRequiredCompanion
        ? [
            {
              speaker: CHARACTERS[this.selectedChar].name,
              role: 'Grand Station Boarding Stairs',
              text: `“Front car of Old Pinewood is open! Ready, ${c1} and ${c2}?”`
            },
            {
              speaker: c1,
              role: 'Grand Station Platform',
              text: '“Tickets stamped, lap bars ready. Let’s take her out!”'
            }
          ]
        : [
            {
              speaker: c1,
              role: 'Grand Station Boarding Stairs',
              text: `“Hey! ${c2} and I just walked up from the plaza—we saw you heading straight for the station stairs!”`
            },
            {
              speaker: c2,
              role: 'Grand Station Platform',
              text: '“Noah’s got the tickets and Alex brought the 2016 photo strip. Front car of Old Pinewood is waiting for us!”'
            }
          ];

      this.metRequiredCompanion = true;
      this.startDialogue(preBoardLines, () => {
        this.beginStoryRide();
      });
    },

    beginStoryRide() {
      this.mode = 'RIDING';
      this.boardedPinewood = true;
      this.rideChoicePrompted = false;

      // Hide park avatars while they are seated on the train
      if (this.playerAvatar) this.playerAvatar.group.visible = false;
      Object.values(this.npcAvatars).forEach((n) => {
        n.group.visible = false;
      });

      // Select Old Pinewood (index 0) and dispatch
      if (CPE.RIDE) {
        if (CPE.RIDE.coasterIndex !== 0) {
          CPE.RIDE.selectCoaster(0);
        }
        CPE.RIDE.resetToStation();
        // Switch to Front-Seat First-Person (or Chase) so the player can look around during the ride!
        if (CPE.RENDER) {
          CPE.RENDER.setCameraMode('fpv');
          if (CPE.UI && CPE.UI.syncCameraButtons) CPE.UI.syncCameraButtons();
        }
        CPE.RIDE.dispatch();
      }

      this.updateObjectiveBanner();
      if (CPE.UI && CPE.UI.showToast) {
        CPE.UI.showToast('Boarding Old Pinewood', 'Drag to look around • Keys 1–4 switch cameras', '#f2c94c');
      }
    },

    triggerMidRideChoice() {
      this.rideChoicePrompted = true;
      this.mode = 'RIDE_CHOICE';
      this.rideChoiceTimer = 18.0; // Plenty of time (18 real seconds, plus train slows slightly on lift)

      const box = document.getElementById('omr-choice-modal');
      if (!box) return;

      const promptText = document.getElementById('omr-choice-prompt');
      if (promptText) {
        promptText.textContent =
          'As Old Pinewood clanks up the diagonal chain lift above the autumn lanterns, Noah and Alex glance back at you. What do you call out to them before the crest?';
      }

      const list = document.getElementById('omr-choice-list');
      if (list) {
        list.innerHTML = '';
        Object.values(RIDE_CHOICES).forEach((ch, idx) => {
          const btn = document.createElement('button');
          btn.className = 'omr-choice-btn';
          btn.innerHTML = `
            <span class="choice-key">${idx + 1}</span>
            <div class="choice-content">
              <div class="choice-line">${ch.label}</div>
              <div class="choice-tone">${ch.tone}</div>
            </div>
          `;
          btn.addEventListener('click', () => this.selectMidRideChoice(ch.id));
          list.appendChild(btn);
        });
      }

      box.classList.remove('hidden');
    },

    selectMidRideChoice(choiceId) {
      if (this.mode !== 'RIDE_CHOICE') return;
      this.rideChoiceMade = choiceId;
      this.mode = 'RIDING';
      if (CPE.RIDE) CPE.RIDE.pauseMidRide = false;

      const box = document.getElementById('omr-choice-modal');
      if (box) box.classList.add('hidden');

      const ch = RIDE_CHOICES[choiceId] || RIDE_CHOICES.present;
      if (CPE.UI && CPE.UI.showToast) {
        CPE.UI.showToast(CHARACTERS[this.selectedChar].name, ch.label, '#f4e9d1');
      }
      this.saveProgress();
    },

    onStoryRideComplete() {
      // Bring player and companions back to the station exit/plaza together
      if (this.playerAvatar) {
        this.playerPos.set(-5.2, 0, 19.8);
        this.playerYaw = 0;
        this.playerAvatar.group.position.copy(this.playerPos);
        this.playerAvatar.group.rotation.y = this.playerYaw;
        this.playerAvatar.group.visible = true;
      }

      const otherIds = Object.keys(this.npcAvatars);
      const spots = [
        { x: -3.6, z: 19.4, yaw: -0.6 },
        { x: -3.8, z: 20.8, yaw: -2.2 }
      ];
      otherIds.forEach((id, i) => {
        const npc = this.npcAvatars[id];
        const sp = spots[i % spots.length];
        npc.pos.set(sp.x, 0, sp.z);
        npc.yaw = sp.yaw;
        npc.group.position.copy(npc.pos);
        npc.group.rotation.y = npc.yaw;
        npc.group.visible = true;
      });

      if (CPE.RENDER) {
        CPE.RENDER.setCameraMode('park');
        CPE.RENDER.isoZoomTarget = 20;
        if (CPE.UI && CPE.UI.syncCameraButtons) CPE.UI.syncCameraButtons();
      }

      this.mode = 'POST_RIDE';
      const lines = getPostRideConversation(this.selectedChar, this.rideChoiceMade || 'present');
      this.startDialogue(lines, () => {
        this.showNextStopSelection();
      });
    },

    showNextStopSelection() {
      const box = document.getElementById('omr-choice-modal');
      const promptText = document.getElementById('omr-choice-prompt');
      const list = document.getElementById('omr-choice-list');
      const timerBar = document.getElementById('omr-choice-timer-fill');
      if (!box || !promptText || !list) {
        this.finishChapterOne('The Cinder Hearth Café');
        return;
      }

      if (timerBar) timerBar.style.width = '100%';
      promptText.textContent = 'Where should Maya, Noah, and Alex head next for Chapter Two?';
      list.innerHTML = '';

      const stops = [
        {
          name: 'The Cinder Hearth Café',
          desc: 'Warm fireplace cocoa, cinnamon pastries, and spreading out Alex’s photo strips on a patio table.'
        },
        {
          name: 'The Sunset Ferris Wheel',
          desc: 'A slow 16-meter climb above the glowing autumn island to watch the night fireworks burst.'
        },
        {
          name: 'Ember Mine Run',
          desc: 'Race over to the runaway ore train and plunge through the glowing lantern cavern under the mountain.'
        }
      ];

      stops.forEach((st, idx) => {
        const btn = document.createElement('button');
        btn.className = 'omr-choice-btn';
        btn.innerHTML = `
          <span class="choice-key">${idx + 1}</span>
          <div class="choice-content">
            <div class="choice-line">${st.name}</div>
            <div class="choice-tone">${st.desc}</div>
          </div>
        `;
        btn.addEventListener('click', () => {
          box.classList.add('hidden');
          this.finishChapterOne(st.name);
        });
        list.appendChild(btn);
      });

      box.classList.remove('hidden');
    },

    finishChapterOne(nextStopName) {
      this.nextStopChoice = nextStopName;
      this.chapterCompleted = true;
      this.mode = 'COMPLETE';
      if (CPE.RIDE) CPE.RIDE.autoDispatch = true; // Re-enable normal coaster auto-dispatch in free-roam
      this.updateObjectiveBanner();
      this.saveProgress();

      // Transition park to Night with fireworks for the celebratory finale!
      if (CPE.RENDER) {
        CPE.RENDER.setTimeOfDay('night');
        if (CPE.UI && CPE.UI.syncTodButtons) CPE.UI.syncTodButtons();
      }

      const modal = document.getElementById('omr-complete-modal');
      if (!modal) return;

      const summaryEl = document.getElementById('omr-complete-summary');
      const chObj = RIDE_CHOICES[this.rideChoiceMade || 'present'];
      const charDef = CHARACTERS[this.selectedChar || 'maya'];
      if (summaryEl) {
        summaryEl.innerHTML = `
          <p>Playing as <b>${charDef.name}</b> (${charDef.role}), you reunited with your group at the Grand Station and rode <b>Old Pinewood</b> together on the final evening of the autumn season.</p>
          <p><b>On the Lift Hill:</b> ${chObj.label} <i>(${chObj.tone})</i></p>
          <p><b>Next Destination Chosen:</b> ${nextStopName}</p>
        `;
      }
      modal.classList.remove('hidden');
    },

    // ------------------------------------------------------------------------
    // Dialogue Runner (Readable on Phone & Desktop, Pause/Close/Advance)
    // ------------------------------------------------------------------------
    startDialogue(lines, onComplete) {
      if (!lines || !lines.length) {
        if (onComplete) onComplete();
        return;
      }
      this.dialogueQueue = lines;
      this.dialogueIndex = 0;
      this.dialogueCallback = onComplete || null;
      this.prevMode = this.mode;
      this.mode = 'DIALOGUE';
      this.renderDialogueStep();
      const box = document.getElementById('omr-dialogue-box');
      if (box) box.classList.remove('hidden');
    },

    renderDialogueStep() {
      const item = this.dialogueQueue[this.dialogueIndex];
      if (!item) {
        this.closeDialogue();
        return;
      }
      const speakerEl = document.getElementById('omr-dlg-speaker');
      const roleEl = document.getElementById('omr-dlg-role');
      const textEl = document.getElementById('omr-dlg-text');
      const stepEl = document.getElementById('omr-dlg-step');

      if (speakerEl) speakerEl.textContent = item.speaker || '';
      if (roleEl) roleEl.textContent = item.role || '';
      if (textEl) textEl.textContent = item.text || '';
      if (stepEl) stepEl.textContent = `${this.dialogueIndex + 1} / ${this.dialogueQueue.length}`;
    },

    advanceDialogue() {
      if (this.mode !== 'DIALOGUE') return;
      this.dialogueIndex++;
      if (this.dialogueIndex >= this.dialogueQueue.length) {
        this.closeDialogue();
      } else {
        this.renderDialogueStep();
      }
    },

    closeDialogue() {
      const box = document.getElementById('omr-dialogue-box');
      if (box) box.classList.add('hidden');
      const cb = this.dialogueCallback;
      this.dialogueCallback = null;
      this.dialogueQueue = [];
      if (this.mode === 'DIALOGUE') {
        this.mode = this.chapterCompleted ? 'COMPLETE' : 'EXPLORE';
      }
      this.updateObjectiveBanner();
      this.saveProgress();
      if (cb) cb();
    },

    // ------------------------------------------------------------------------
    // Frame Update: Movement, Collision, Proximity Prompts & Ride Triggers
    // ------------------------------------------------------------------------
    update(dt, elapsed) {
      if (!this.initialized || !this.selectedChar) return;

      // Animate hotspot beacons
      for (let i = 0; i < this.hotspots.length; i++) {
        const b = this.hotspots[i].beacon;
        if (b) {
          b.rotation.y = elapsed * 2.0 + i;
          b.position.y = (this.hotspots[i].id === 'station_board' ? 2.25 : 1.45) + Math.sin(elapsed * 3.2 + i) * 0.10;
        }
      }

      // Handle Mid-Ride Choice on Old Pinewood's Chain Lift
      if (this.mode === 'RIDING' && !this.rideChoicePrompted && CPE.RIDE) {
        const smp = CPE.RIDE.currentSample;
        if (
          (CPE.RIDE.state === 'LIFT' && CPE.RIDE.s > 20) ||
          (smp && smp.segmentType === 'lift' && CPE.RIDE.s > 18)
        ) {
          this.triggerMidRideChoice();
        }
      }

      if (this.mode === 'RIDE_CHOICE') {
        this.rideChoiceTimer -= dt;
        const timerBar = document.getElementById('omr-choice-timer-fill');
        if (timerBar) {
          const pct = Math.max(0, Math.min(100, (this.rideChoiceTimer / 18.0) * 100));
          timerBar.style.width = pct + '%';
        }
        // Pause train near lift crest if player is still reading so they never miss the choice
        if (CPE.RIDE && CPE.RIDE.s > 36 && this.rideChoiceTimer > 0) {
          CPE.RIDE.pauseMidRide = true;
        }
        if (this.rideChoiceTimer <= 0) {
          this.selectMidRideChoice('present');
        }
      }

      // Player Movement in EXPLORE or COMPLETE (Free-Roam) mode
      let moveSpeed = 0;
      if (this.mode === 'EXPLORE' || this.mode === 'COMPLETE') {
        let inputX = 0;
        let inputY = 0;
        if (this.keys.left) inputX -= 1;
        if (this.keys.right) inputX += 1;
        if (this.keys.up) inputY -= 1;
        if (this.keys.down) inputY += 1;
        if (this.joyVec.active) {
          inputX += this.joyVec.x;
          inputY += this.joyVec.y;
        }

        const mag = Math.hypot(inputX, inputY);
        if (mag > 0.08) {
          const normX = inputX / Math.max(1, mag);
          const normY = inputY / Math.max(1, mag);

          // Align movement direction with current isometric camera azimuth so "Up/W" always moves up-screen!
          const camAz = CPE.RENDER ? CPE.RENDER.isoAzimuthCurrent : Math.PI * 0.25;
          const forwardX = -Math.sin(camAz);
          const forwardZ = -Math.cos(camAz);
          const rightX = Math.cos(camAz);
          const rightZ = -Math.sin(camAz);

          const worldDx = rightX * normX + forwardX * (-normY);
          const worldDz = rightZ * normX + forwardZ * (-normY);

          const walkVel = 6.2 * Math.min(1, mag);
          this.playerPos.x += worldDx * walkVel * dt;
          this.playerPos.z += worldDz * walkVel * dt;
          resolvePlayerCollision(this.playerPos);

          this.playerYaw = Math.atan2(worldDx, worldDz);
          moveSpeed = walkVel;
        }
      }

      // Update Player 3D Avatar transform & walk animation
      if (this.playerAvatar && this.playerAvatar.group.visible) {
        this.playerAvatar.group.position.copy(this.playerPos);
        this.playerAvatar.group.rotation.y = this.playerYaw;
        animateAvatar(this.playerAvatar, moveSpeed, dt, elapsed, this.mode === 'DIALOGUE');
      }

      // Update Companion NPCs & check interaction proximity
      let nearest = null;
      let nearestDist = 999;

      Object.keys(this.npcAvatars).forEach((npcId) => {
        const npc = this.npcAvatars[npcId];
        if (!npc.group.visible) return;
        const d = this.playerPos.distanceTo(npc.pos);
        // Smoothly turn companion toward player when nearby
        if (d < 5.0) {
          const targetYaw = Math.atan2(this.playerPos.x - npc.pos.x, this.playerPos.z - npc.pos.z);
          npc.yaw += (targetYaw - npc.yaw) * Math.min(1, dt * 6);
          npc.group.rotation.y = npc.yaw;
        }
        animateAvatar(npc, 0, dt, elapsed + (npcId === 'noah' ? 1.3 : 2.7), this.mode === 'DIALOGUE' && d < 4.0);

        if (d < 3.2 && d < nearestDist) {
          nearestDist = d;
          const def = CHARACTERS[npcId];
          nearest = {
            type: 'npc',
            id: npcId,
            label: `Talk to ${def.name} (${def.role})`,
            onTrigger: () => {
              const lines = getCompanionEncounterLines(this.selectedChar, npcId, this);
              this.startDialogue(lines);
            }
          };
        }
      });

      // Check park hotspots
      for (let i = 0; i < this.hotspots.length; i++) {
        const h = this.hotspots[i];
        const d = Math.hypot(this.playerPos.x - h.x, this.playerPos.z - h.z);
        if (d < h.radius && d < nearestDist) {
          nearestDist = d;
          nearest = {
            type: 'hotspot',
            id: h.id,
            label: h.getPrompt(),
            onTrigger: h.onInteract
          };
        }
      }

      this.activeInteractable = (this.mode === 'EXPLORE' || this.mode === 'COMPLETE') ? nearest : null;
      this.updateInteractionPromptUI();
    },

    updateInteractionPromptUI() {
      const promptBtn = document.getElementById('omr-interact-prompt');
      const mobileActBtn = document.getElementById('omr-mobile-interact-btn');
      if (!promptBtn) return;

      if (this.activeInteractable) {
        promptBtn.classList.remove('hidden');
        promptBtn.innerHTML = `<kbd>E</kbd> <span>${this.activeInteractable.label}</span>`;
        if (mobileActBtn) {
          mobileActBtn.classList.add('ready');
          mobileActBtn.textContent = '💬 Interact';
        }
      } else {
        promptBtn.classList.add('hidden');
        if (mobileActBtn) {
          mobileActBtn.classList.remove('ready');
          mobileActBtn.textContent = '✋ Action';
        }
      }
    },

    triggerActiveInteraction() {
      if (this.mode === 'DIALOGUE') {
        this.advanceDialogue();
        return;
      }
      if (this.activeInteractable && this.activeInteractable.onTrigger) {
        this.activeInteractable.onTrigger();
      }
    },

    // ------------------------------------------------------------------------
    // Ride Event Listeners (Detect when Old Pinewood completes its lap)
    // ------------------------------------------------------------------------
    bindRideEvents() {
      if (!CPE.events) return;
      CPE.events.on('stateChanged', ({ to }) => {
        if ((this.mode === 'RIDING' || this.mode === 'RIDE_CHOICE') && to === 'UNLOAD') {
          if (CPE.RIDE) CPE.RIDE.pauseMidRide = false;
          const choiceBox = document.getElementById('omr-choice-modal');
          if (choiceBox) choiceBox.classList.add('hidden');
          if (!this.rideChoiceMade) this.rideChoiceMade = 'present';
          this.onStoryRideComplete();
        }
      });
    },

    // ------------------------------------------------------------------------
    // Keyboard & Mobile Touch Joystick Input Listeners
    // ------------------------------------------------------------------------
    bindInputListeners() {
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        const code = e.code;
        const key = e.key.toLowerCase();

        // Number keys 1-3 select choices when choice modal is open
        if (this.mode === 'RIDE_CHOICE') {
          if (key === '1') { e.stopImmediatePropagation(); this.selectMidRideChoice('nostalgia'); return; }
          if (key === '2') { e.stopImmediatePropagation(); this.selectMidRideChoice('honesty'); return; }
          if (key === '3') { e.stopImmediatePropagation(); this.selectMidRideChoice('present'); return; }
        }

        // Movement keys (WASD / Arrow keys)
        if (code === 'KeyW' || code === 'ArrowUp') { this.keys.up = true; }
        if (code === 'KeyS' || code === 'ArrowDown') { this.keys.down = true; }
        if (code === 'KeyA' || code === 'ArrowLeft') { this.keys.left = true; }
        if (code === 'KeyD' || code === 'ArrowRight') { this.keys.right = true; }

        // Interaction / Dialogue Advance (E or Enter)
        if (code === 'KeyE' || code === 'Enter') {
          if (this.mode === 'DIALOGUE') {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.advanceDialogue();
          } else if (this.activeInteractable) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.triggerActiveInteraction();
          }
        }

        // Escape pauses/closes dialogue or opens help/character menu
        if (code === 'Escape') {
          if (this.mode === 'DIALOGUE') {
            this.closeDialogue();
          }
        }
      }, true); // Use capture phase so E / 1-3 in story prompts don't conflict with orbit/camera shortcuts

      window.addEventListener('keyup', (e) => {
        const code = e.code;
        if (code === 'KeyW' || code === 'ArrowUp') this.keys.up = false;
        if (code === 'KeyS' || code === 'ArrowDown') this.keys.down = false;
        if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = false;
        if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = false;
      });

      // Touch Joystick binding
      const joyZone = document.getElementById('omr-joystick-zone');
      const joyKnob = document.getElementById('omr-joystick-knob');
      if (joyZone && joyKnob) {
        let touchId = null;
        let centerX = 0;
        let centerY = 0;
        const maxRadius = 36;

        const updateJoy = (clientX, clientY) => {
          const dx = clientX - centerX;
          const dy = clientY - centerY;
          const dist = Math.min(maxRadius, Math.hypot(dx, dy));
          const ang = Math.atan2(dy, dx);
          const kx = Math.cos(ang) * dist;
          const ky = Math.sin(ang) * dist;
          joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
          this.joyVec.x = kx / maxRadius;
          this.joyVec.y = ky / maxRadius;
          this.joyVec.active = dist > 4;
        };

        const resetJoy = () => {
          touchId = null;
          joyKnob.style.transform = 'translate(0px, 0px)';
          this.joyVec.x = 0;
          this.joyVec.y = 0;
          this.joyVec.active = false;
        };

        joyZone.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          touchId = e.pointerId;
          const rect = joyZone.getBoundingClientRect();
          centerX = rect.left + rect.width * 0.5;
          centerY = rect.top + rect.height * 0.5;
          joyZone.setPointerCapture(e.pointerId);
          updateJoy(e.clientX, e.clientY);
        });

        joyZone.addEventListener('pointermove', (e) => {
          if (e.pointerId !== touchId) return;
          e.stopPropagation();
          updateJoy(e.clientX, e.clientY);
        });

        joyZone.addEventListener('pointerup', resetJoy);
        joyZone.addEventListener('pointercancel', resetJoy);
      }
    },

    // ------------------------------------------------------------------------
    // Build Story DOM & Pixel-Art Character Portraits
    // ------------------------------------------------------------------------
    drawPixelPortrait(canvas, charDef) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.imageSmoothingEnabled = false;

      // Autumn dusk sky backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#2a1a30');
      grad.addColorStop(0.6, '#6e241b');
      grad.addColorStop(1, '#d9a33c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Distant glowing ferris wheel silhouette
      ctx.strokeStyle = 'rgba(255, 210, 117, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(18, 22, 12, 0, Math.PI * 2);
      ctx.stroke();

      const px = (x, y, pw, ph, hex) => {
        ctx.fillStyle = typeof hex === 'number' ? '#' + hex.toString(16).padStart(6, '0') : hex;
        ctx.fillRect(x * 4, y * 4, pw * 4, ph * 4);
      };

      // Coat & shoulders
      px(4, 13, 12, 7, charDef.coatHex);
      // Scarf
      px(5, 11, 10, 2, charDef.scarfHex);
      // Head
      px(6, 5, 8, 6, charDef.skinHex);
      // Eyes
      px(7, 7, 1, 2, '#161121');
      px(12, 7, 1, 2, '#161121');
      // Warm smile
      px(9, 9, 2, 1, '#9e3b2b');

      // Hat / Hair
      if (charDef.hatStyle === 'beanie') {
        px(5, 5, 1, 6, charDef.hairHex);
        px(14, 5, 1, 6, charDef.hairHex);
        px(6, 3, 8, 2, charDef.scarfHex);
        px(9, 1, 2, 2, '#f4e9d1');
      } else if (charDef.hatStyle === 'cap') {
        px(6, 3, 8, 2, '#2b3642');
        px(6, 4, 10, 1, '#3b4254');
      } else {
        px(5, 3, 10, 3, charDef.hairHex);
        px(5, 5, 1, 4, charDef.hairHex);
        px(14, 5, 1, 4, charDef.hairHex);
      }
    },

    renderCharSelectOverlay(savedGame) {
      const grid = document.getElementById('omr-char-grid');
      const resumeBanner = document.getElementById('omr-resume-banner');
      if (!grid) return;
      grid.innerHTML = '';

      Object.values(CHARACTERS).forEach((ch) => {
        const card = document.createElement('div');
        card.className = 'omr-char-card';
        card.dataset.char = ch.id;
        card.innerHTML = `
          <div class="char-portrait-wrap">
            <canvas width="80" height="80" class="char-pixel-canvas"></canvas>
            <span class="char-role-pill" style="background:${ch.accentHex}">${ch.role}</span>
          </div>
          <div class="char-card-body">
            <div class="char-card-name">${ch.name} <span class="char-age">(${ch.age})</span></div>
            <div class="char-card-tagline">${ch.tagline}</div>
            <div class="char-card-desc">${ch.description}</div>
            <div class="char-keepsake">🎒 Starts with: <b>${ch.keepsakeLabel}</b></div>
            <button class="char-select-btn" style="background:${ch.accentHex}">Play as ${ch.name}</button>
          </div>
        `;
        const cvs = card.querySelector('canvas');
        if (cvs) this.drawPixelPortrait(cvs, ch);

        card.querySelector('.char-select-btn').addEventListener('click', () => {
          this.selectCharacter(ch.id, null);
        });
        grid.appendChild(card);
      });

      if (resumeBanner) {
        if (savedGame && CHARACTERS[savedGame.selectedChar]) {
          const sChar = CHARACTERS[savedGame.selectedChar];
          resumeBanner.classList.remove('hidden');
          resumeBanner.innerHTML = `
            <div>
              <b>Saved Progress Found:</b> Playing as <b>${sChar.name}</b>
              ${savedGame.chapterCompleted ? '(Chapter One Complete)' : '(In Progress)'}
            </div>
            <div style="display:flex;gap:8px;">
              <button id="omr-btn-resume" class="omr-small-btn gold">Continue Saved Game</button>
              <button id="omr-btn-clear-save" class="omr-small-btn">Reset Save</button>
            </div>
          `;
          const btnRes = document.getElementById('omr-btn-resume');
          const btnClr = document.getElementById('omr-btn-clear-save');
          if (btnRes) btnRes.addEventListener('click', () => this.selectCharacter(savedGame.selectedChar, savedGame));
          if (btnClr) btnClr.addEventListener('click', () => this.clearSaveAndRestart());
        } else {
          resumeBanner.classList.add('hidden');
        }
      }
    },

    buildStoryUI() {
      const style = document.createElement('style');
      style.textContent = `
        .hidden { display: none !important; }

        /* CHARACTER SELECTION OPENING SCREEN */
        #omr-select-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: radial-gradient(circle at center, rgba(32, 20, 38, 0.88), rgba(14, 9, 18, 0.96));
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          overflow-y: auto;
          backdrop-filter: blur(6px);
        }
        .omr-select-container {
          max-width: 960px;
          width: 100%;
          background: rgba(24, 17, 29, 0.96);
          border: 2px solid #d4a63b;
          border-radius: 16px;
          padding: 20px 24px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.8);
          color: #f4e9d1;
          max-height: 94vh;
          overflow-y: auto;
        }
        .omr-header {
          text-align: center;
          margin-bottom: 14px;
        }
        .omr-eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #f2c94c;
        }
        .omr-main-title {
          font-family: 'Bevan', serif;
          font-size: 26px;
          color: #f4e9d1;
          text-shadow: 0 3px 0 #661a18;
          margin: 2px 0 6px;
        }
        .omr-theme-question {
          font-size: 13px;
          color: #e3d6ba;
          max-width: 660px;
          margin: 0 auto;
          line-height: 1.4;
        }
        .omr-theme-question i {
          color: #f2c94c;
        }

        #omr-resume-banner {
          background: rgba(212, 166, 59, 0.15);
          border: 1px solid #d4a63b;
          border-radius: 10px;
          padding: 9px 14px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 12px;
        }
        .omr-small-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid #d4a63b;
          color: #f4e9d1;
          font-family: 'Hanken Grotesk', sans-serif;
          font-size: 11px;
          font-weight: 800;
          padding: 5px 11px;
          border-radius: 6px;
          cursor: pointer;
        }
        .omr-small-btn.gold {
          background: #d9383a;
          border-color: #f2c94c;
          color: #fff;
        }

        #omr-char-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .omr-char-card {
          background: #f4e9d1;
          color: #2a1a1f;
          border: 2px solid #cbb692;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .omr-char-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 24px rgba(0,0,0,0.45);
          border-color: #d9383a;
        }
        .char-portrait-wrap {
          background: #1c1322;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px dashed rgba(42, 26, 31, 0.25);
        }
        .char-pixel-canvas {
          width: 68px;
          height: 68px;
          border-radius: 8px;
          border: 2px solid #d4a63b;
          image-rendering: pixelated;
        }
        .char-role-pill {
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .char-card-body {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 6px;
        }
        .char-card-name {
          font-family: 'Bevan', serif;
          font-size: 18px;
          color: #2a1a1f;
        }
        .char-age {
          font-family: 'Hanken Grotesk', sans-serif;
          font-size: 12px;
          color: #6e4e3a;
        }
        .char-card-tagline {
          font-size: 12px;
          font-weight: 800;
          color: #82231f;
          line-height: 1.3;
        }
        .char-card-desc {
          font-size: 11.5px;
          color: #472918;
          line-height: 1.38;
          flex: 1;
        }
        .char-keepsake {
          font-size: 11px;
          background: rgba(42,26,31,0.08);
          padding: 5px 8px;
          border-radius: 6px;
          color: #2a1a1f;
        }
        .char-select-btn {
          margin-top: 4px;
          border: none;
          color: #fff;
          font-family: 'Bevan', serif;
          font-size: 13px;
          letter-spacing: 0.6px;
          padding: 9px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .char-select-btn:hover { opacity: 0.92; }

        .omr-controls-guide {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(212, 166, 59, 0.35);
          border-radius: 10px;
          padding: 9px 14px;
          font-size: 11.5px;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 8px;
          color: #d4c5a9;
        }
        .omr-controls-guide b { color: #f2c94c; }

        /* UNOBTRUSIVE STORY OBJECTIVE BANNER */
        #omr-objective-bar {
          position: fixed;
          top: 68px;
          left: 14px;
          z-index: 22;
          background: rgba(18, 12, 23, 0.92);
          border: 2px solid #d4a63b;
          border-radius: 10px;
          padding: 6px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 540px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.55);
          color: #f4e9d1;
          font-size: 12px;
        }
        #omr-char-badge {
          font-family: 'Bevan', serif;
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 5px;
          color: #fff;
          letter-spacing: 0.6px;
        }
        #omr-obj-text {
          font-weight: 700;
          line-height: 1.25;
        }
        #omr-keepsake-pill {
          font-size: 10.5px;
          color: #f2c94c;
          font-weight: 700;
          white-space: nowrap;
          border-left: 1px solid rgba(212, 166, 59, 0.35);
          padding-left: 8px;
        }
        .omr-bar-actions {
          display: flex;
          gap: 4px;
          margin-left: 4px;
        }
        .omr-mini-btn {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(212, 166, 59, 0.45);
          color: #f4e9d1;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 7px;
          border-radius: 5px;
          cursor: pointer;
          white-space: nowrap;
        }
        .omr-mini-btn:hover { background: rgba(242, 201, 76, 0.22); }

        /* INTERACTION PROMPT PILL */
        #omr-interact-prompt {
          position: fixed;
          bottom: 138px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 28;
          background: rgba(18, 12, 23, 0.95);
          border: 2px solid #f2c94c;
          color: #f4e9d1;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0,0,0,0.65);
          animation: promptBob 1.2s infinite alternate ease-in-out;
        }
        #omr-interact-prompt kbd {
          background: #d9383a;
          color: #fff;
          padding: 2px 7px;
          border-radius: 5px;
          font-family: 'Bevan', serif;
          font-size: 12px;
        }
        @keyframes promptBob {
          0% { transform: translateX(-50%) translateY(0); }
          100% { transform: translateX(-50%) translateY(-4px); }
        }

        /* DIALOGUE BOX */
        #omr-dialogue-box {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: min(620px, calc(100vw - 24px));
          z-index: 45;
          background: rgba(18, 12, 23, 0.96);
          border: 2px solid #d4a63b;
          border-radius: 14px;
          padding: 14px 18px;
          color: #f4e9d1;
          box-shadow: 0 14px 36px rgba(0,0,0,0.75);
        }
        .dlg-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        #omr-dlg-speaker {
          font-family: 'Bevan', serif;
          font-size: 16px;
          color: #f2c94c;
        }
        #omr-dlg-role {
          font-size: 11px;
          color: #b8a693;
          font-weight: 700;
          margin-left: 8px;
        }
        #omr-dlg-text {
          font-size: 14px;
          line-height: 1.45;
          color: #fff8e8;
          margin-bottom: 10px;
        }
        .dlg-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #b8a693;
        }
        .dlg-actions {
          display: flex;
          gap: 8px;
        }

        /* MID-RIDE / NEXT-STOP CHOICE MODAL */
        #omr-choice-modal {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          width: min(580px, calc(100vw - 24px));
          z-index: 50;
          background: rgba(18, 12, 23, 0.96);
          border: 2px solid #f2c94c;
          border-radius: 14px;
          padding: 14px 18px;
          color: #f4e9d1;
          box-shadow: 0 16px 40px rgba(0,0,0,0.8);
        }
        .choice-timer-track {
          width: 100%;
          height: 5px;
          background: rgba(255,255,255,0.12);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        #omr-choice-timer-fill {
          width: 100%;
          height: 100%;
          background: #d9383a;
          transition: width 0.1s linear;
        }
        #omr-choice-prompt {
          font-size: 13.5px;
          font-weight: 700;
          color: #fff8e8;
          margin-bottom: 10px;
          line-height: 1.35;
        }
        #omr-choice-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .omr-choice-btn {
          background: rgba(244, 233, 209, 0.95);
          color: #2a1a1f;
          border: 2px solid #cbb692;
          border-radius: 9px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          cursor: pointer;
          font-family: 'Hanken Grotesk', sans-serif;
          transition: transform 0.12s ease, border-color 0.12s ease;
        }
        .omr-choice-btn:hover {
          transform: translateX(3px);
          border-color: #d9383a;
          background: #fff;
        }
        .choice-key {
          background: #d9383a;
          color: #fff;
          font-family: 'Bevan', serif;
          font-size: 12px;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .choice-line {
          font-size: 13px;
          font-weight: 800;
          color: #2a1a1f;
        }
        .choice-tone {
          font-size: 10.5px;
          font-weight: 700;
          color: #6e4e3a;
        }

        /* CHAPTER ONE COMPLETE MODAL */
        #omr-complete-modal {
          position: fixed;
          inset: 0;
          z-index: 95;
          background: rgba(12, 8, 18, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          backdrop-filter: blur(5px);
        }
        .omr-complete-card {
          max-width: 500px;
          width: 100%;
          background: rgba(24, 17, 29, 0.97);
          border: 2px solid #f2c94c;
          border-radius: 16px;
          padding: 22px 24px;
          text-align: center;
          color: #f4e9d1;
          box-shadow: 0 20px 50px rgba(0,0,0,0.85);
        }
        .omr-complete-card h2 {
          font-family: 'Bevan', serif;
          font-size: 24px;
          color: #f2c94c;
          margin: 4px 0 10px;
        }
        #omr-complete-summary {
          font-size: 13px;
          line-height: 1.45;
          color: #e3d6ba;
          text-align: left;
          background: rgba(0,0,0,0.28);
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(212, 166, 59, 0.35);
          margin-bottom: 14px;
        }

        /* MOBILE TOUCH JOYSTICK & ACTION BUTTON */
        #omr-mobile-controls {
          position: fixed;
          bottom: 132px;
          left: 16px;
          right: 16px;
          z-index: 25;
          display: none;
          align-items: flex-end;
          justify-content: space-between;
          pointer-events: none;
        }
        #omr-joystick-zone {
          pointer-events: auto;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: rgba(18, 12, 23, 0.72);
          border: 2px solid rgba(212, 166, 59, 0.65);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: none;
        }
        #omr-joystick-knob {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #f2c94c, #b3882d);
          box-shadow: 0 3px 10px rgba(0,0,0,0.5);
          pointer-events: none;
        }
        #omr-mobile-interact-btn {
          pointer-events: auto;
          background: rgba(18, 12, 23, 0.85);
          border: 2px solid #d4a63b;
          color: #f4e9d1;
          font-family: 'Bevan', serif;
          font-size: 13px;
          padding: 12px 18px;
          border-radius: 999px;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(0,0,0,0.6);
          touch-action: manipulation;
        }
        #omr-mobile-interact-btn.ready {
          background: #d9383a;
          border-color: #f2c94c;
          color: #fff;
        }

        @media (max-width: 820px), (pointer: coarse) {
          #omr-char-grid {
            grid-template-columns: 1fr;
          }
          #omr-objective-bar {
            top: 96px;
            left: 6px;
            right: 6px;
            max-width: none;
            padding: 5px 9px;
            font-size: 11px;
          }
          #omr-keepsake-pill { display: none; }
          #omr-mobile-controls {
            display: flex;
          }
          #omr-dialogue-box, #omr-choice-modal {
            bottom: 126px;
          }
        }
      `;
      document.head.appendChild(style);

      const wrapper = document.createElement('div');
      wrapper.id = 'omr-ui-root';
      wrapper.innerHTML = `
        <!-- 1. Character Selection Opening Screen -->
        <div id="omr-select-overlay">
          <div class="omr-select-container">
            <div class="omr-header">
              <div class="omr-eyebrow">Chapter One • Final Evening of the Autumn Season</div>
              <div class="omr-main-title">CINDERPINE EXPRESS: ONE MORE RIDE</div>
              <div class="omr-theme-question">
                <i>“Can we enjoy a place as it is now, even when we miss what it used to be?”</i><br/>
                Choose your perspective for tonight’s reunion at Cinderpine Park:
              </div>
            </div>

            <div id="omr-resume-banner" class="hidden"></div>
            <div id="omr-char-grid"></div>

            <div class="omr-controls-guide">
              <span><b>Walk:</b> WASD / Arrow Keys (or Touch Joystick)</span>
              <span><b>Interact / Talk:</b> E / Enter / Tap Prompt</span>
              <span><b>Cameras:</b> Keys 1–4, Drag to Orbit / Look, Q/E Turn</span>
              <span><b>Coasters & Dispatch:</b> [ / ] Switch Track, Space Dispatch</span>
            </div>
          </div>
        </div>

        <!-- 2. Unobtrusive Current Objective Banner -->
        <div id="omr-objective-bar">
          <span id="omr-char-badge">MAYA</span>
          <span id="omr-obj-text">Find Noah or Alex and meet at the Grand Station.</span>
          <span id="omr-keepsake-pill">🎒 Keepsake</span>
          <div class="omr-bar-actions">
            <button id="omr-btn-help" class="omr-mini-btn" title="Controls & Story Help">? Controls</button>
            <button id="omr-btn-newgame" class="omr-mini-btn" title="Switch Character or Restart Chapter">↺ Character</button>
          </div>
        </div>

        <!-- 3. Context-Sensitive Interaction Prompt -->
        <div id="omr-interact-prompt" class="hidden">
          <kbd>E</kbd> <span>Interact</span>
        </div>

        <!-- 4. Mobile Touch Joystick & Action Button -->
        <div id="omr-mobile-controls">
          <div id="omr-joystick-zone" title="Drag to Walk">
            <div id="omr-joystick-knob"></div>
          </div>
          <button id="omr-mobile-interact-btn">✋ Action</button>
        </div>

        <!-- 5. Dialogue Box -->
        <div id="omr-dialogue-box" class="hidden">
          <div class="dlg-top-row">
            <div><span id="omr-dlg-speaker">Maya</span><span id="omr-dlg-role">The Younger Sister</span></div>
            <span id="omr-dlg-step">1 / 3</span>
          </div>
          <div id="omr-dlg-text"></div>
          <div class="dlg-footer">
            <span>Press <b>E</b> / <b>Enter</b> or tap Next</span>
            <div class="dlg-actions">
              <button id="omr-dlg-close" class="omr-small-btn">Close</button>
              <button id="omr-dlg-next" class="omr-small-btn gold">Next ▸</button>
            </div>
          </div>
        </div>

        <!-- 6. Mid-Ride & Post-Ride Choice Modal -->
        <div id="omr-choice-modal" class="hidden">
          <div class="choice-timer-track"><div id="omr-choice-timer-fill"></div></div>
          <div id="omr-choice-prompt"></div>
          <div id="omr-choice-list"></div>
        </div>

        <!-- 7. Chapter One Complete Screen -->
        <div id="omr-complete-modal" class="hidden">
          <div class="omr-complete-card">
            <div class="omr-eyebrow">Cinderpine Express: One More Ride</div>
            <h2>Chapter One Complete</h2>
            <div id="omr-complete-summary"></div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <button id="omr-btn-freeroam" class="omr-small-btn gold">Continue Exploring Park & Coasters</button>
              <button id="omr-btn-restart" class="omr-small-btn">New Game / Switch Character</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(wrapper);

      // Bind UI button clicks
      const promptEl = document.getElementById('omr-interact-prompt');
      if (promptEl) promptEl.addEventListener('click', () => this.triggerActiveInteraction());

      const mobBtn = document.getElementById('omr-mobile-interact-btn');
      if (mobBtn) mobBtn.addEventListener('click', () => this.triggerActiveInteraction());

      const dlgNext = document.getElementById('omr-dlg-next');
      if (dlgNext) dlgNext.addEventListener('click', () => this.advanceDialogue());

      const dlgClose = document.getElementById('omr-dlg-close');
      if (dlgClose) dlgClose.addEventListener('click', () => this.closeDialogue());

      const btnNew = document.getElementById('omr-btn-newgame');
      if (btnNew) {
        btnNew.addEventListener('click', () => {
          const selectOverlay = document.getElementById('omr-select-overlay');
          if (selectOverlay) {
            this.renderCharSelectOverlay(this.loadSave());
            selectOverlay.classList.remove('hidden');
          }
        });
      }

      const btnHelp = document.getElementById('omr-btn-help');
      if (btnHelp) {
        btnHelp.addEventListener('click', () => {
          this.startDialogue([
            {
              speaker: 'Park Guide & Controls',
              role: 'Cinderpine Express: One More Ride',
              text: 'Walk with WASD / Arrow Keys (or the bottom-left Touch Joystick on mobile). When near a companion or glowing beacon, press E / Enter or tap the prompt to interact. During rides, drag to look around or press 1–4 to switch cameras!'
            }
          ]);
        });
      }

      const btnFreeRoam = document.getElementById('omr-btn-freeroam');
      if (btnFreeRoam) {
        btnFreeRoam.addEventListener('click', () => {
          document.getElementById('omr-complete-modal').classList.add('hidden');
        });
      }

      const btnRestart = document.getElementById('omr-btn-restart');
      if (btnRestart) {
        btnRestart.addEventListener('click', () => this.clearSaveAndRestart());
      }
    }
  };
})();
