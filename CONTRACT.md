# Cinderpine Express — Architecture & Module Contract

## 1. World Coordinate System & Layout
- **Units**: 1 unit = 1 meter. Y-up (`+Y` is up, `+X` is East, `-X` is West, `+Z` is South/Front, `-Z` is North/Back).
- **Floating Island Slab**:
  - Top surface `Y = 0` across `X in [-54, 54]`, `Z in [-38, 38]` (108 m × 76 m rounded rectangle, corner radius 8 m).
  - Cliff rim drops from `Y = 0` down to `Y = -22` with stepped/faceted plum-rock strata (`[-54..54]` tapering to bottom point/ledges).
  - **Midway / Park Zone** (West & South): `X in [-50, -14]`, `Z in [-32, 32]` plus southern promenade `X in [-50, 46]`, `Z in [18, 34]`.
  - **Station Location**: `X in [-10, 8]`, `Z = 14`, track centerline at `(x = -8 .. +6, y = 2.2, z = 14)` heading `+X` (`yaw = 0`, where `yaw = 0` points along `+X`, `yaw = pi/2` points along `-Z` (North), `yaw = pi` points along `-X` (West), `yaw = -pi/2` points along `+Z` (South)).
    - Specifically, local tangent vector for `yaw` and `pitch`:
      `forward = (cos(pitch) * cos(yaw), sin(pitch), -cos(pitch) * sin(yaw))`
      Wait — let's make sure standard right-handed math is crystal clear:
      - At `yaw = 0, pitch = 0`: `forward = (1, 0, 0)` (`+X` East), `up = (0, 1, 0)`, `right = (0, 0, 1)` (`+Z` South).
      - Turning left (`+yaw`): rotates towards `-Z` (North).
      - Specifically:
        `forward(yaw, pitch) = new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw), Math.sin(pitch), -Math.cos(pitch)*Math.sin(yaw))`
  - **Coaster Zone**: `X in [-12, 64]` (shifted inside island `X in [-12, 50]`, `Z in [-34, 16]` — 62 m × 50 m footprint, up to `76 x 50 m` including over-cliff/midway flyovers inside `X in [-24, 52], Z in [-34, 16]`).
  - **Ground Height Function**: `WORLD.getGroundY(x, z)` returns `0` on the main island table, or rock hill elevation if over the Mine Train's rock hill (`center = (24, -18)`, radius `13m`, peak `Y = 9.5`, with tunnel bore along the mine train's S-curve).

## 2. Shared Global Namespace (`window.CPE`)
All modules attach to `window.CPE = window.CPE || {}`.

### 2.1 `CPE.PALETTE` & Materials (`CPE.MATS`)
Key autumn & fairground hex colors (also baked into the 90-color OKLab post-processing palette):
- `GRASS_DRY`: `0xc8963e`
- `GRASS_OLIVE`: `0x8c7a36`
- `GRASS_MOSS`: `0x5a6332`
- `DIRT_PATH`: `0xa47449`
- `COBBLESTONE`: `0x7d6b65`
- `PLUM_ROCK_LIGHT`: `0x6e4f63`
- `PLUM_ROCK`: `0x4d354c`
- `PLUM_ROCK_DARK`: `0x2f1e36`
- `BRICK_RED`: `0x9e3b2b`
- `BRICK_DARK`: `0x6e241b`
- `CHERRY_RED`: `0xd9383a`
- `CREAM`: `0xf4e9d1`
- `BRASS`: `0xd9a33c`
- `GOLD`: `0xf2c94c`
- `TIMBER_LIGHT`: `0xb57c4a`
- `TIMBER_MID`: `0x8c5832`
- `TIMBER_DARK`: `0x59361e`
- `STEEL_TEAL`: `0x367a82`
- `STEEL_DARK`: `0x2b3642`
- `SLATE_ROOF`: `0x3b4254`
- `FOLIAGE_GOLD`: `0xe59f28`
- `FOLIAGE_ORANGE`: `0xd65f24`
- `FOLIAGE_CRIMSON`: `0xa82828`
- `FOLIAGE_PINE`: `0x2e4d38`
- `WARM_GLOW`: `0xffd275`

Helper:
- `CPE.makeMat(hex, opts)` -> returns `THREE.MeshLambertMaterial` or `THREE.MeshStandardMaterial` (flatShading: true by default for crisp pixel-art facets). For glowing windows/lamps, `CPE.makeGlowMat(hex, intensity)` whose emissive intensity scales automatically with `CPE.lighting.nightFactor` (`0` in Day, `0.6` in Dusk, `1.0` in Night).

### 2.2 Dynamic Light Slots (`CPE.LIGHTS`)
To stay fast on mobile and WebGL1 uniform limits:
- 1 `THREE.HemisphereLight` (sky/ground ambient)
- 1 primary `THREE.DirectionalLight` (sun/moon with shadows or crisp directional shading)
- 1 fill `THREE.DirectionalLight`
- Up to **6 `THREE.PointLight`s** managed by `CPE.LIGHTS`:
  - Slot 0: Coaster Train Headlamp (attached to front of Car 0, active at Dusk/Night)
  - Slot 1: Station & Queue Warm Lanterns cluster (`(-1, 5, 14)`)
  - Slot 2: Midway Fountain & Cafe Plaza (`(-26, 5, 10)`)
  - Slot 3: Ferris Wheel & Carousel Midway (`(-34, 8, -12)`)
  - Slot 4: Stall Row Warm Glow (`(-18, 5, -6)`)
  - Slot 5: Fireworks Burst Light (dynamic position & color during night fireworks)
- Lamp posts, stall signs, ferris wheel spokes, and cafe windows use `CPE.registerGlowMaterial(mat, baseColor, dayIntensity, nightIntensity)` so 100+ lamps/windows glow brightly at dusk/night with zero extra shader light overhead!

### 2.3 Track & Coaster Data Structure (`CPE.TRACK`)
Built by the coaster solver & physics engine for each of the 3 coasters (`0: Old Pinewood`, `1: Cinderloop`, `2: Ember Mine Run`):
Each coaster `coaster = CPE.COASTERS[index]` has:
- `id`: `'pinewood' | 'cinderloop' | 'mine'`
- `name`: `'Old Pinewood' | 'Cinderloop' | 'Ember Mine Run'`
- `type`: `'wood' | 'steel' | 'mine'`
- `colorPrimary`, `colorSecondary`, `colorSupport`
- `totalLength`: total loop length in meters (float)
- `ds`: sample spacing (`0.5` m)
- `points`: Array of `N` sample nodes (`s = 0` at station center `(-1, 2.2, 14)`), each node having:
  - `s`: arc length (m)
  - `pos`: `THREE.Vector3` (track heartline / rail midpoint)
  - `tangent`: `THREE.Vector3` (unit forward)
  - `normal`: `THREE.Vector3` (unit up, banked! Points from track toward rider's head)
  - `binormal`: `THREE.Vector3` (unit right, banked! `tangent x normal`)
  - `bank`: roll angle in radians
  - `pitch`: pitch angle in radians
  - `yaw`: yaw angle in radians
  - `curvature`: `dTheta / ds` (1/m)
  - `segmentType`: `'station' | 'lift' | 'drop' | 'hill' | 'loop' | 'helix' | 'trim' | 'tunnel' | 'brake' | 'track'`
  - `sectionName`: human-readable section name for Marquee HUD (`"Station"`, `"Chain Lift"`, `"First Drop"`, `"Camelback Hill"`, `"Vertical Loop"`, `"Trim Brake"`, `"Banked Helix"`, `"Mine Tunnel"`, `"Final Brake"`, etc.)
  - `speed`: pre-solved/reference speed (m/s)
  - `vG`: felt vertical G (`1.0` at rest, `< 0.2` airtime, up to `<= 4.2` in loop/pullout)
  - `latG`: lateral G (`~0.0` due to force-vector banking)
  - `airtime`: boolean (`vG < 0.25`)
  - `inTunnel`: boolean
- `tunnelRanges`: Array of `{ sStart, sEnd }` where rock tunnel encloses the track
- `stats`:
  - `length`: meters
  - `maxHeight`: meters above ground
  - `maxDrop`: meters
  - `maxSpeedKmh`: km/h
  - `maxPosG`: g
  - `minNegG`: g
  - `airtimeSec`: seconds
  - `inversions`: count (`0` or `1`)
  - `excitement`: float (e.g., `7.4`)
  - `intensity`: float (e.g., `6.8`)
  - `nausea`: float (e.g., `3.2`)
  - `ratingLabel`: `'HIGH' | 'EXTREME' | 'MEDIUM'`
  - `closureError`: meters (`< 1.0` m, typically `< 0.05` m)
- Method `coaster.sampleAt(s)`:
  - Wraps `s` modulo `totalLength`, linearly interpolates `pos`, `tangent`, `normal`, `binormal`, `bank`, `pitch`, `vG`, `latG`, and returns `{ pos, tangent, normal, binormal, bank, pitch, vG, latG, segmentType, sectionName, airtime, inTunnel }`.

### 2.4 Ride State Machine (`CPE.RIDE`)
`CPE.RIDE` manages the active coaster and live train kinematics:
- `coasterIndex`: `0 | 1 | 2`
- `state`: `'UNLOAD' | 'BOARD' | 'DISPATCH' | 'LIFT' | 'RIDE' | 'BRAKE' | 'ARRIVE'`
- `s`: current arc-length position of Train Center (Car 2) in meters (`0` = centered in station)
- `speed`: current train speed in m/s
- `lapTime`: elapsed time since leaving station (seconds)
- `boardTimer`: countdown to auto-dispatch (`13.0` s)
- `gateOpen`: `0..1` (animated open during `UNLOAD`/`BOARD`, closed in `DISPATCH`..`ARRIVE`)
- `restraintClosed`: `0..1`
- `cars`: Array of 5 car states (`i = 0..4`, where `i = 0` is front car at `s + 2 * carSpacing`, `i = 4` is rear car at `s - 2 * carSpacing`, `carSpacing = 2.55` m):
  - `s`: car arc-length
  - `pos`, `tangent`, `normal`, `binormal`
  - `matrix`: `THREE.Matrix4`
  - `armsUp`: `0..1` (smoothed rider arm-raise factor during drops, airtime, loop)
- `currentSample`: sample at front car (`cars[0]`)

### 2.5 Event Bus (`CPE.events`)
`CPE.events.on(eventName, callback)` and `CPE.events.emit(eventName, payload)`:
- `'coasterChanged'`: `{ index, coaster }`
- `'stateChanged'`: `{ from, to, coaster }`
- `'dispatch'`: `{ coaster }` (triggers station bell + toast)
- `'enterSection'`: `{ sectionType, sectionName, coaster }`
- `'toast'`: `{ text, subtitle, color }` (e.g. `"Loop!"`, `"Airtime!"`, `"Big Drop!"`, `"Tunnel!"`, `"Trim Brake"`)
- `'brakeHiss'`: `{ intensity }`
- `'scream'`: `{ intensity }`
- `'fireworkLaunch'`: `{ x, y, z }`
- `'fireworkBurst'`: `{ x, y, z, color }`
- `'timeOfDayChanged'`: `{ mode: 'day' | 'dusk' | 'night' }`

### 2.6 Ground & Park Collision / Avoidance (`CPE.WORLD`)
- `CPE.WORLD.getTerrainHeight(x, z)`: returns height of island top (`0.0`) or rock hill if inside Ember Mine Run's mountain (`x in [10, 42], z in [-32, -4]`).
- `CPE.WORLD.isOverPathOrQueue(x, z)`: returns `true` if `(x,z)` overlaps midway paths or switchback queue so coaster support columns straddle or skip footpath tiles cleanly.
- `CPE.WORLD.trainPos`: updated every frame with `cars[0].pos` and `speed` so nearby box-people turn and cheer (`cheerFactor`) when the train passes within 14 m at speed!
