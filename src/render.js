// Cinderpine Express — Rendering Pipeline, 90-Color OKLab Post Shader, Lighting & Cameras
(function() {
  const CPE = window.CPE = window.CPE || {};

  // ============================================================================
  // 1. 90-COLOR AUTUMN & FAIRGROUND PALETTE (Converted to OKLab at startup)
  // ============================================================================
  const PALETTE_HEX = [
    // Deep Night / Shadows / Outlines (10)
    0x0d0a14, 0x161121, 0x1f172b, 0x281e36, 0x332542,
    0x121824, 0x1b2436, 0x24324a, 0x2f415e, 0x3d5475,
    // Plum Rock & Cliff Strata (10)
    0x2a1a30, 0x38233d, 0x472d4c, 0x57385c, 0x68456e,
    0x7a5480, 0x8d6691, 0x4a3b4e, 0x615066, 0x79677d,
    // Dry Autumn Grass, Moss & Pine (12)
    0x1e3326, 0x284232, 0x34543f, 0x43694d, 0x567d59,
    0x474f27, 0x5c6632, 0x737d3e, 0x8c9146, 0xa6a34e,
    0xb5913b, 0xc9a247,
    // Autumn Foliage: Gold, Amber, Orange, Crimson (12)
    0xdba628, 0xebba34, 0xf7ce45, 0xe07a1b, 0xed8f2b,
    0xf7a63b, 0xb8371d, 0xcf4725, 0xe35b2d, 0x851c1c,
    0x9e2424, 0xb82e2e,
    // Timber, Wood Trestles & Dirt Paths (12)
    0x331d11, 0x472918, 0x5c3620, 0x734529, 0x8a5433,
    0xa1663f, 0xb8794d, 0xcf8f61, 0x6e4e3a, 0x85614a,
    0x9c755c, 0xb58b70,
    // Brick, Cherry Red & Fairground Tent Accents (10)
    0x4a1212, 0x661a18, 0x82231f, 0x9e2f28, 0xba3c32,
    0xd6493b, 0xeb5e4d, 0xf57d6e, 0x91294c, 0xb53861,
    // Cream, Parchment, Clouds & Warm Glow (10)
    0xd4c5a9, 0xe3d6ba, 0xf0e4ca, 0xfaf0dc, 0xffffff,
    0xffdf80, 0xffe999, 0xfff3b8, 0xffb84d, 0xff9933,
    // Brass, Gold & Steel Coaster Teal / Slate (14)
    0x6e5219, 0x8f6b22, 0xb3882d, 0xd4a63b, 0xf0c24d,
    0x19383d, 0x224d54, 0x2d646e, 0x397d8a, 0x4999a6,
    0x61b4c2, 0x262b38, 0x384052, 0x4d586e
  ];

  // Convert sRGB [0..1] to OKLab [L, a, b]
  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function hexToOklab(hex) {
    const r = srgbToLinear(((hex >> 16) & 255) / 255);
    const g = srgbToLinear(((hex >> 8) & 255) / 255);
    const b = srgbToLinear((hex & 255) / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return new THREE.Vector3(
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    );
  }
  function hexToRgbVec(hex) {
    return new THREE.Vector3(
      ((hex >> 16) & 255) / 255,
      ((hex >> 8) & 255) / 255,
      (hex & 255) / 255
    );
  }

  // Register glowing materials so windows, lamp posts, signs & ferris wheel glow at dusk/night
  const glowMaterials = [];
  CPE.registerGlowMaterial = function(mat, hexColor, dayIntensity = 0.05, nightIntensity = 0.95) {
    if (!mat) return mat;
    const col = new THREE.Color(hexColor !== undefined ? hexColor : 0xffd275);
    mat.emissive = col;
    mat.emissiveIntensity = dayIntensity;
    glowMaterials.push({ mat, col, dayIntensity, nightIntensity });
    return mat;
  };

  CPE.makeMat = function(hex, opts = {}) {
    const mat = new THREE.MeshLambertMaterial({
      color: hex,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : true,
      ...opts
    });
    if (opts.glow) {
      CPE.registerGlowMaterial(mat, opts.glowColor || hex, opts.dayGlow || 0.05, opts.nightGlow || 0.95);
    }
    return mat;
  };

  // ============================================================================
  // 2. POST-PROCESSING SHADER (Depth Outlines + OKLab 90-Color Bayer Dither + Sky/Clouds/Stars)
  // ============================================================================
  const postVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const postFragmentShader = `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uNear;
    uniform float uFar;
    uniform float uIsOrtho;
    uniform float uTime;
    uniform float uNightFactor; // 0.0 = Day, 0.5 = Dusk, 1.0 = Night
    uniform float uDuskFactor;  // 1.0 at Dusk, 0.0 at Day/Night
    uniform float uCameraYaw;
    uniform float uCameraPitch;
    uniform vec3 uPaletteLab[90];
    uniform vec3 uPaletteRgb[90];

    float getLinearDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      if (uIsOrtho > 0.5) {
        return mix(uNear, uFar, z);
      } else {
        float z_ndc = 2.0 * z - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z_ndc * (uFar - uNear));
      }
    }

    vec3 srgbToLinear(vec3 c) {
      return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    }

    vec3 rgbToOklab(vec3 c) {
      vec3 lin = srgbToLinear(clamp(c, 0.0, 1.0));
      float l = pow(max(0.0, 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b), 1.0/3.0);
      float m = pow(max(0.0, 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b), 1.0/3.0);
      float s = pow(max(0.0, 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b), 1.0/3.0);
      return vec3(
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
      );
    }

    // 4x4 Bayer Matrix in [-0.5, 0.5]
    float bayer4x4(vec2 pos) {
      int x = int(mod(pos.x, 4.0));
      int y = int(mod(pos.y, 4.0));
      int idx = y * 4 + x;
      float v = 0.0;
      if (idx == 0) v = 0.0; else if (idx == 1) v = 8.0; else if (idx == 2) v = 2.0; else if (idx == 3) v = 10.0;
      else if (idx == 4) v = 12.0; else if (idx == 5) v = 4.0; else if (idx == 6) v = 14.0; else if (idx == 7) v = 6.0;
      else if (idx == 8) v = 3.0; else if (idx == 9) v = 11.0; else if (idx == 10) v = 1.0; else if (idx == 11) v = 9.0;
      else if (idx == 12) v = 15.0; else if (idx == 13) v = 7.0; else if (idx == 14) v = 13.0; else v = 5.0;
      return (v / 16.0) - 0.46875;
    }

    // Hash & 2D Value Noise for Pixel Clouds & Stars
    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }

    float noise2D(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    vec3 renderProceduralSky(vec2 uv) {
      // Shift sky UV gently with camera orientation
      float y = clamp(uv.y, 0.0, 1.0);

      // Day Sky: warm autumn cerulean to golden cream horizon
      vec3 dayTop = vec3(0.28, 0.56, 0.68);
      vec3 dayMid = vec3(0.58, 0.76, 0.78);
      vec3 dayBot = vec3(0.94, 0.84, 0.66);
      vec3 daySky = mix(dayBot, mix(dayMid, dayTop, smoothstep(0.35, 1.0, y)), smoothstep(0.0, 0.5, y));

      // Dusk Sky: deep plum zenith to crimson/amber sunset horizon
      vec3 duskTop = vec3(0.18, 0.12, 0.28);
      vec3 duskMid = vec3(0.68, 0.25, 0.32);
      vec3 duskBot = vec3(0.95, 0.58, 0.24);
      vec3 duskSky = mix(duskBot, mix(duskMid, duskTop, smoothstep(0.3, 1.0, y)), smoothstep(0.0, 0.45, y));

      // Night Sky: deep indigo-plum cosmos
      vec3 nightTop = vec3(0.05, 0.04, 0.09);
      vec3 nightMid = vec3(0.11, 0.08, 0.18);
      vec3 nightBot = vec3(0.20, 0.14, 0.26);
      vec3 nightSky = mix(nightBot, mix(nightMid, nightTop, smoothstep(0.3, 1.0, y)), smoothstep(0.0, 0.5, y));

      vec3 sky = mix(daySky, nightSky, uNightFactor);
      sky = mix(sky, duskSky, uDuskFactor);

      // Twinkling Pixel Stars at Dusk/Night
      if (uNightFactor > 0.25) {
        vec2 starGrid = floor(uv * uResolution * 0.5 + vec2(uCameraYaw * 40.0, 0.0));
        float h = hash21(starGrid);
        if (h > 0.992 && y > 0.22) {
          float twinkle = 0.65 + 0.35 * sin(uTime * 3.5 + h * 100.0);
          float starVis = smoothstep(0.25, 0.85, uNightFactor) * twinkle;
          vec3 starCol = (h > 0.997) ? vec3(1.0, 0.92, 0.72) : vec3(0.92, 0.95, 1.0);
          sky = mix(sky, starCol, starVis);
        }
      }

      // Layered Pixel-Art Clouds
      vec2 cloudUv = vec2(uv.x * 3.2 + uCameraYaw * 0.45 + uTime * 0.012, (uv.y - 0.15) * 4.5);
      if (uv.y > 0.12) {
        float n1 = noise2D(cloudUv * 2.2);
        float n2 = noise2D(cloudUv * 4.5 + vec2(12.3, 4.5));
        float cVal = n1 * 0.65 + n2 * 0.35;
        float band = sin(uv.y * 3.14159);
        float cloudMask = smoothstep(0.54, 0.68, cVal * band);
        if (cloudMask > 0.05) {
          vec3 cloudDay = vec3(0.98, 0.93, 0.82);
          vec3 cloudDusk = vec3(0.96, 0.55, 0.34);
          vec3 cloudNight = vec3(0.22, 0.16, 0.30);
          vec3 cCol = mix(cloudDay, cloudNight, uNightFactor);
          cCol = mix(cCol, cloudDusk, uDuskFactor);
          // Cloud underside shadow
          float shade = smoothstep(0.52, 0.72, noise2D(cloudUv * 2.2 + vec2(0.0, 0.35)));
          cCol *= (0.82 + 0.18 * shade);
          sky = mix(sky, cCol, cloudMask * 0.85);
        }
      }

      return sky;
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      float rawZ = texture2D(tDepth, vUv).x;

      vec3 baseColor;
      if (rawZ >= 0.9998) {
        baseColor = renderProceduralSky(vUv);
      } else {
        baseColor = texture2D(tColor, vUv).rgb;

        // Depth-based pixel-art edge detection (4-neighbor Roberts/Laplacian)
        float dC = getLinearDepth(vUv);
        float dL = getLinearDepth(vUv - vec2(texel.x, 0.0));
        float dR = getLinearDepth(vUv + vec2(texel.x, 0.0));
        float dU = getLinearDepth(vUv + vec2(0.0, texel.y));
        float dD = getLinearDepth(vUv - vec2(0.0, texel.y));

        // Silhouette / crease detection
        float maxDiff = max(max(abs(dC - dL), abs(dC - dR)), max(abs(dC - dU), abs(dC - dD)));
        float laplacian = (dL + dR + dU + dD) - 4.0 * dC;
        float depthScale = uIsOrtho > 0.5 ? 1.35 : max(0.6, dC * 0.032);

        if (maxDiff > 1.55 * depthScale && laplacian > 0.35 * depthScale) {
          // Outer silhouette dark plum-ink outline
          baseColor *= 0.38;
        } else if (laplacian < -0.55 * depthScale) {
          // Subtle inner ridge highlight
          baseColor = mix(baseColor, vec3(1.0, 0.92, 0.78), 0.12);
        }
      }

      // Apply ordered 4x4 Bayer dither in OKLab space before snapping to the 90-color palette
      float bayer = bayer4x4(gl_FragCoord.xy);
      vec3 lab = rgbToOklab(baseColor);
      lab.x += bayer * 0.032;
      lab.y += bayer * 0.010;
      lab.z += bayer * 0.010;

      // Nearest neighbor search in 90-color OKLab palette
      float bestDist = 999.0;
      vec3 bestRgb = baseColor;
      for (int i = 0; i < 90; i++) {
        vec3 d = lab - uPaletteLab[i];
        // Weight lightness & chroma perceptually
        float distSq = d.x * d.x * 1.35 + d.y * d.y + d.z * d.z;
        if (distSq < bestDist) {
          bestDist = distSq;
          bestRgb = uPaletteRgb[i];
        }
      }

      gl_FragColor = vec4(bestRgb, 1.0);
    }
  `;

  // ============================================================================
  // 3. RENDERER, CAMERAS & LIGHTING MANAGER
  // ============================================================================
  CPE.RENDER = {
    renderer: null,
    scene: null,
    rt: null,
    postScene: null,
    postCamera: null,
    postMaterial: null,
    pixelSize: 2, // default 2 CSS px per art pixel (adjustable 1..6)

    // Cameras
    cameraMode: 'park', // 'park' | 'follow' | 'chase' | 'fpv'
    orthoCam: null,
    perspCam: null,
    activeCamera: null,

    // Park isometric camera state (31° elevation, quarter-turn or free drag orbit)
    isoElevation: 31 * Math.PI / 180,
    isoAzimuth: Math.PI * 0.25,       // target azimuth
    isoAzimuthCurrent: Math.PI * 0.25,
    isoZoom: 44,                      // ortho half-height in meters
    isoZoomTarget: 44,
    isoTarget: new THREE.Vector3(-4, 4, 2),
    isoTargetGoal: new THREE.Vector3(-4, 4, 2),

    // First-person look offset (drag to look around)
    fpvYawOffset: 0,
    fpvPitchOffset: 0,
    fpvQuatSmooth: new THREE.Quaternion(),

    // Follow & Chase camera smoothing
    chasePosSmooth: new THREE.Vector3(0, 8, 20),
    chaseLookSmooth: new THREE.Vector3(0, 4, 14),

    // Lighting state
    timeOfDay: 'day', // 'day' | 'dusk' | 'night'
    nightFactor: 0.0,
    nightTarget: 0.0,
    duskFactor: 0.0,
    duskTarget: 0.0,

    init(container) {
      this.container = container;
      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(1); // We control exact pixel resolution via low-res WebGLRenderTarget!
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.domElement.style.imageRendering = 'pixelated';
      container.appendChild(renderer.domElement);
      this.renderer = renderer;

      const scene = new THREE.Scene();
      this.scene = scene;

      // Setup Ortho & Perspective Cameras
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.orthoCam = new THREE.OrthographicCamera(
        -this.isoZoom * aspect, this.isoZoom * aspect,
        this.isoZoom, -this.isoZoom,
        -120, 260
      );
      this.perspCam = new THREE.PerspectiveCamera(65, aspect, 0.25, 240);
      this.activeCamera = this.orthoCam;

      // Setup Lighting & Dynamic Light Slots
      this.initLights(scene);

      // Setup Low-Res RenderTarget with DepthTexture
      this.initPostProcess();

      // Setup Mouse / Touch / Wheel Camera Controls
      this.initControls(renderer.domElement);

      window.addEventListener('resize', () => this.onResize());
      this.onResize();
    },

    initLights(scene) {
      const hemi = new THREE.HemisphereLight(0xffeedd, 0x5c4252, 0.72);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xfff1d0, 0.88);
      sun.position.set(45, 75, 38);
      scene.add(sun);

      const fill = new THREE.DirectionalLight(0x9ab4d6, 0.28);
      fill.position.set(-45, 30, -40);
      scene.add(fill);

      // 6 Dynamic PointLights for Dusk/Night
      const makePt = (color, dist, x, y, z) => {
        const l = new THREE.PointLight(color, 0, dist, 1.6);
        l.position.set(x, y, z);
        scene.add(l);
        return l;
      };

      CPE.LIGHTS = {
        hemi,
        sun,
        fill,
        headlamp: makePt(0xfff0b8, 28, -1, 3, 14),
        stationLanterns: makePt(0xffb85c, 26, -1, 5.5, 15),
        plazaLight: makePt(0xffb85c, 28, -26, 6, 9),
        midwayLight: makePt(0xffa852, 30, -34, 9, -12),
        stallsLight: makePt(0xffb85c, 26, -19, 5.5, -2),
        fireworkLight: makePt(0xffd966, 65, 0, 32, -32)
      };
    },

    initPostProcess() {
      const paletteLab = PALETTE_HEX.map(hexToOklab);
      const paletteRgb = PALETTE_HEX.map(hexToRgbVec);

      this.createRenderTarget();

      this.postScene = new THREE.Scene();
      this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.postMaterial = new THREE.ShaderMaterial({
        vertexShader: postVertexShader,
        fragmentShader: postFragmentShader,
        uniforms: {
          tColor: { value: this.rt.texture },
          tDepth: { value: this.rt.depthTexture },
          uResolution: { value: new THREE.Vector2(this.rt.width, this.rt.height) },
          uNear: { value: -120 },
          uFar: { value: 260 },
          uIsOrtho: { value: 1.0 },
          uTime: { value: 0 },
          uNightFactor: { value: 0 },
          uDuskFactor: { value: 0 },
          uCameraYaw: { value: 0 },
          uCameraPitch: { value: 0 },
          uPaletteLab: { value: paletteLab },
          uPaletteRgb: { value: paletteRgb }
        },
        depthWrite: false,
        depthTest: false
      });

      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
      this.postScene.add(quad);
    },

    createRenderTarget() {
      const w = Math.max(120, Math.floor(window.innerWidth / this.pixelSize));
      const h = Math.max(80, Math.floor(window.innerHeight / this.pixelSize));

      if (this.rt) {
        this.rt.setSize(w, h);
      } else {
        const rt = new THREE.WebGLRenderTarget(w, h, {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          format: THREE.RGBAFormat
        });
        rt.depthTexture = new THREE.DepthTexture(w, h);
        rt.depthTexture.type = THREE.UnsignedShortType;
        rt.depthTexture.minFilter = THREE.NearestFilter;
        rt.depthTexture.magFilter = THREE.NearestFilter;
        this.rt = rt;
      }

      if (this.postMaterial) {
        this.postMaterial.uniforms.tColor.value = this.rt.texture;
        this.postMaterial.uniforms.tDepth.value = this.rt.depthTexture;
        this.postMaterial.uniforms.uResolution.value.set(w, h);
      }
    },

    setPixelSize(px) {
      this.pixelSize = Math.max(1, Math.min(6, Math.round(px)));
      this.createRenderTarget();
    },

    setTimeOfDay(mode) {
      this.timeOfDay = mode;
      if (mode === 'day') {
        this.nightTarget = 0.0;
        this.duskTarget = 0.0;
      } else if (mode === 'dusk') {
        this.nightTarget = 0.45;
        this.duskTarget = 1.0;
      } else {
        this.nightTarget = 1.0;
        this.duskTarget = 0.0;
      }
      CPE.events.emit('timeOfDayChanged', { mode });
    },

    setCameraMode(mode) {
      this.cameraMode = mode;
      if (mode === 'fpv') {
        this.fpvYawOffset = 0;
        this.fpvPitchOffset = 0;
      }
      if (CPE.TRACK_VIEW && CPE.TRACK_VIEW.setFirstPersonHide) {
        CPE.TRACK_VIEW.setFirstPersonHide(mode === 'fpv');
      }
    },

    quarterTurn(dir) {
      // Rotate isometric camera by 90 degrees (PI/2)
      this.isoAzimuth += dir * (Math.PI * 0.5);
      if (this.cameraMode !== 'park' && this.cameraMode !== 'follow') {
        this.setCameraMode('park');
      }
    },

    onResize() {
      const W = window.innerWidth;
      const H = Math.max(1, window.innerHeight);
      this.renderer.setSize(W, H);
      this.createRenderTarget();
      this.perspCam.aspect = W / H;
      this.perspCam.updateProjectionMatrix();
    },

    initControls(dom) {
      let isDragging = false;
      let prevX = 0, prevY = 0;
      let pinchDist = 0;

      dom.addEventListener('pointerdown', (e) => {
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
      });

      window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;

        if (this.cameraMode === 'fpv') {
          this.fpvYawOffset = Math.max(-1.3, Math.min(1.3, this.fpvYawOffset - dx * 0.0045));
          this.fpvPitchOffset = Math.max(-0.7, Math.min(0.7, this.fpvPitchOffset - dy * 0.0045));
        } else {
          this.isoAzimuth -= dx * 0.0055;
        }
      });

      window.addEventListener('pointerup', () => {
        isDragging = false;
      });

      dom.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.isoZoomTarget = Math.max(14, Math.min(68, this.isoZoomTarget + e.deltaY * 0.035));
      }, { passive: false });

      // Touch pinch-zoom
      dom.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          pinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      }, { passive: true });

      dom.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && pinchDist > 0) {
          const d = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const delta = pinchDist - d;
          pinchDist = d;
          this.isoZoomTarget = Math.max(14, Math.min(68, this.isoZoomTarget + delta * 0.12));
        }
      }, { passive: true });
    },

    update(dt, elapsed) {
      // Smooth lighting transition
      const lerpRate = Math.min(1, dt * 3.5);
      this.nightFactor += (this.nightTarget - this.nightFactor) * lerpRate;
      this.duskFactor += (this.duskTarget - this.duskFactor) * lerpRate;

      const nf = this.nightFactor;
      const df = this.duskFactor;
      CPE.lighting = { nightFactor: nf, duskFactor: df, mode: this.timeOfDay };
      CPE.timeOfDay = this.timeOfDay;

      // Update Hemi & Directional Sun/Moon
      const L = CPE.LIGHTS;
      const dayHemiSky = new THREE.Color(0xffeedd);
      const duskHemiSky = new THREE.Color(0xe87a5a);
      const nightHemiSky = new THREE.Color(0x283054);
      L.hemi.color.copy(dayHemiSky).lerp(nightHemiSky, nf).lerp(duskHemiSky, df);
      L.hemi.intensity = 0.74 - 0.36 * nf;

      const daySun = new THREE.Color(0xfff2d4);
      const duskSun = new THREE.Color(0xff7733);
      const nightMoon = new THREE.Color(0x6680b8);
      L.sun.color.copy(daySun).lerp(nightMoon, nf).lerp(duskSun, df);
      L.sun.intensity = 0.88 - 0.52 * nf;

      // Update glowing materials & dynamic lamp point lights
      const lampStrength = Math.max(0, Math.min(1, nf * 1.45 + df * 0.55));
      for (let i = 0; i < glowMaterials.length; i++) {
        const gm = glowMaterials[i];
        gm.mat.emissiveIntensity = gm.dayIntensity + (gm.nightIntensity - gm.dayIntensity) * lampStrength;
      }

      L.stationLanterns.intensity = 1.35 * lampStrength;
      L.plazaLight.intensity = 1.25 * lampStrength;
      L.midwayLight.intensity = 1.35 * lampStrength;
      L.stallsLight.intensity = 1.25 * lampStrength;

      // Train Headlamp positioned ahead of front car
      const frontCar = CPE.RIDE.cars[0];
      if (frontCar) {
        const inTun = frontCar.sample && frontCar.sample.inTunnel;
        const headPower = Math.max(lampStrength, inTun ? 1.0 : 0.0);
        L.headlamp.intensity = 1.8 * headPower;
        L.headlamp.position.copy(frontCar.pos)
          .addScaledVector(frontCar.tangent, 2.8)
          .addScaledVector(frontCar.normal, 0.8);
      }

      // Decay firework burst light
      if (L.fireworkLight.intensity > 0.01) {
        L.fireworkLight.intensity *= Math.pow(0.15, dt);
      } else {
        L.fireworkLight.intensity = 0;
      }

      // Update Active Camera
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);

      if (this.cameraMode === 'park' || this.cameraMode === 'follow') {
        this.activeCamera = this.orthoCam;
        this.isoAzimuthCurrent += (this.isoAzimuth - this.isoAzimuthCurrent) * Math.min(1, dt * 8.0);
        this.isoZoom += (this.isoZoomTarget - this.isoZoom) * Math.min(1, dt * 8.0);

        if (this.cameraMode === 'follow') {
          this.isoTargetGoal.copy(CPE.RIDE.cars[1].pos);
          // Zoom in slightly if zoomed way out
          if (this.isoZoomTarget > 30) this.isoZoomTarget = 26;
        } else if (CPE.STORY && CPE.STORY.isFollowingPlayer && CPE.STORY.isFollowingPlayer()) {
          this.isoTargetGoal.copy(CPE.STORY.playerPos);
          this.isoTargetGoal.y += 1.2;
        } else {
          this.isoTargetGoal.set(-3, 4.5, 1);
        }
        this.isoTarget.lerp(this.isoTargetGoal, Math.min(1, dt * 6.0));

        const dist = 90;
        const cosEl = Math.cos(this.isoElevation); // cos(31°)
        const sinEl = Math.sin(this.isoElevation); // sin(31°)
        this.orthoCam.position.set(
          this.isoTarget.x + dist * cosEl * Math.sin(this.isoAzimuthCurrent),
          this.isoTarget.y + dist * sinEl,
          this.isoTarget.z + dist * cosEl * Math.cos(this.isoAzimuthCurrent)
        );
        this.orthoCam.up.set(0, 1, 0);
        this.orthoCam.lookAt(this.isoTarget);
        this.orthoCam.left = -this.isoZoom * aspect;
        this.orthoCam.right = this.isoZoom * aspect;
        this.orthoCam.top = this.isoZoom;
        this.orthoCam.bottom = -this.isoZoom;
        this.orthoCam.updateProjectionMatrix();

        this.postMaterial.uniforms.uIsOrtho.value = 1.0;
        this.postMaterial.uniforms.uNear.value = this.orthoCam.near;
        this.postMaterial.uniforms.uFar.value = this.orthoCam.far;
        this.postMaterial.uniforms.uCameraYaw.value = this.isoAzimuthCurrent;
        this.postMaterial.uniforms.uCameraPitch.value = -this.isoElevation;

      } else if (this.cameraMode === 'chase') {
        this.activeCamera = this.perspCam;
        const rearCar = CPE.RIDE.cars[4];
        const frontCar = CPE.RIDE.cars[0];
        const desiredPos = rearCar.pos.clone()
          .addScaledVector(rearCar.tangent, -5.8)
          .addScaledVector(rearCar.normal, 2.7);
        const desiredLook = frontCar.pos.clone()
          .addScaledVector(frontCar.normal, 0.9);

        this.chasePosSmooth.lerp(desiredPos, Math.min(1, dt * 10.0));
        this.chaseLookSmooth.lerp(desiredLook, Math.min(1, dt * 12.0));

        this.perspCam.position.copy(this.chasePosSmooth);
        this.perspCam.up.lerp(rearCar.normal, Math.min(1, dt * 8.0)).normalize();
        this.perspCam.lookAt(this.chaseLookSmooth);
        this.perspCam.fov = 62 + Math.min(18, CPE.RIDE.speed * 0.75);
        this.perspCam.updateProjectionMatrix();

        this.postMaterial.uniforms.uIsOrtho.value = 0.0;
        this.postMaterial.uniforms.uNear.value = this.perspCam.near;
        this.postMaterial.uniforms.uFar.value = this.perspCam.far;
        this.postMaterial.uniforms.uCameraYaw.value = Math.atan2(frontCar.tangent.x, frontCar.tangent.z);

      } else if (this.cameraMode === 'fpv') {
        this.activeCamera = this.perspCam;
        const car0 = CPE.RIDE.cars[0];
        const eyePos = new THREE.Vector3();
        const targetPos = new THREE.Vector3();
        const upVec = new THREE.Vector3();

        if (CPE.TRACK_VIEW && CPE.TRACK_VIEW.getFirstPersonPose &&
            CPE.TRACK_VIEW.getFirstPersonPose(eyePos, targetPos, upVec)) {
          // Use exact front-seat eye mount above sculpted nose
        } else {
          eyePos.copy(car0.pos)
            .addScaledVector(car0.tangent, 0.35)
            .addScaledVector(car0.normal, 1.05);
          targetPos.copy(eyePos).add(car0.tangent);
          upVec.copy(car0.normal);
        }
        this.perspCam.position.copy(eyePos);

        // Build base orientation looking along targetPos with upVec as up
        const lookMat = new THREE.Matrix4().lookAt(eyePos, targetPos, upVec);
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
        // Apply drag-look yaw & pitch offset
        const offsetQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(this.fpvPitchOffset, this.fpvYawOffset, 0, 'YXZ')
        );
        targetQuat.multiply(offsetQuat);
        this.fpvQuatSmooth.slerp(targetQuat, Math.min(1, dt * 18.0));
        this.perspCam.quaternion.copy(this.fpvQuatSmooth);

        // FOV widens dynamically with speed (64° at rest -> up to 88° at peak speed)
        this.perspCam.fov = 64 + Math.min(24, CPE.RIDE.speed * 1.15);
        this.perspCam.updateProjectionMatrix();

        this.postMaterial.uniforms.uIsOrtho.value = 0.0;
        this.postMaterial.uniforms.uNear.value = this.perspCam.near;
        this.postMaterial.uniforms.uFar.value = this.perspCam.far;
        this.postMaterial.uniforms.uCameraYaw.value = Math.atan2(car0.tangent.x, car0.tangent.z) + this.fpvYawOffset;
      }

      // Render 3D scene into low-res RenderTarget
      this.postMaterial.uniforms.uTime.value = elapsed;
      this.postMaterial.uniforms.uNightFactor.value = this.nightFactor;
      this.postMaterial.uniforms.uDuskFactor.value = this.duskFactor;

      this.renderer.setRenderTarget(this.rt);
      this.renderer.clear();
      this.renderer.render(this.scene, this.activeCamera);

      // Render Post-Processing Shader to screen
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.postScene, this.postCamera);
    }
  };
})();
