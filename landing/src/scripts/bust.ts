import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MODEL_URL = '/models/napoleon.glb';
const MODEL_HEIGHT = 2.35;
const DUST_COUNT = 140;
const INTRO_SECONDS = 2.6;

export type BustMode = 'hero' | 'manifesto';

export interface BustStage {
  /** Scroll progress of the owning section, from 0 to 1. */
  setProgress(progress: number): void;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// Both stages share one download; each gets its own clone of the normalized model.
let modelPromise: Promise<Object3D> | null = null;

function loadModel(): Promise<Object3D> {
  modelPromise ??= (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(MODEL_URL);
    const model = gltf.scene;

    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material as MeshStandardMaterial;
      material.roughness = 0.62;
      material.metalness = 0;
      material.envMapIntensity = 0.6;
    });

    // Center on the origin and scale to a fixed height. The scan already faces the camera.
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    model.position.sub(box.getCenter(new Vector3()));
    const holder = new Group();
    holder.add(model);
    holder.scale.setScalar(MODEL_HEIGHT / size.y);
    return holder;
  })();
  return modelPromise;
}

function dustSprite(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(255, 236, 190, 1)');
  glow.addColorStop(0.35, 'rgba(212, 176, 113, 0.55)');
  glow.addColorStop(1, 'rgba(212, 176, 113, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createDust(): Points<BufferGeometry, PointsMaterial> {
  const positions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4.2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 3.6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    size: 0.05,
    map: dustSprite(),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    opacity: 0,
  });
  return new Points(geometry, material);
}

export async function mountBust(container: HTMLElement, mode: BustMode = 'hero'): Promise<BustStage> {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isHero = mode === 'hero';

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'block h-full w-full';
  if (isHero) renderer.domElement.style.touchAction = 'pan-y';

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.15, 6.2);

  // Warm afternoon light through a palace window, with a gilded rim from behind.
  const ambient = new AmbientLight(new Color('#f3e6cf'), 0.35);
  scene.add(ambient);
  const key = new SpotLight(new Color('#ffdcaa'), 60, 20, Math.PI / 6, 0.6, 1.4);
  key.position.set(-3.2, 3.6, 4.2);
  scene.add(key);
  const fill = new DirectionalLight(new Color('#c9d4e6'), 0.35);
  fill.position.set(3.5, 0.5, 2.5);
  scene.add(fill);
  const rim = new DirectionalLight(new Color('#e7b866'), 2.4);
  rim.position.set(2.8, 2.2, -3.5);
  scene.add(rim);

  const pivot = new Group();
  scene.add(pivot);

  const dust = createDust();
  if (!reducedMotion) scene.add(dust);

  pivot.add((await loadModel()).clone(true));
  container.append(renderer.domElement);

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  // Inputs shared by both modes.
  let progress = 0;
  let smoothProgress = 0;
  const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true },
  );

  // Hero only: drag to turn the bust, released with inertia.
  const drag = { active: false, lastX: 0, angle: 0, velocity: 0 };
  let hover = 0;
  let hoverTarget = 0;
  if (isHero) {
    const canvas = renderer.domElement;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (event) => {
      drag.active = true;
      drag.lastX = event.clientX;
      drag.velocity = 0;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag.active) return;
      const dx = (event.clientX - drag.lastX) / container.clientWidth;
      drag.lastX = event.clientX;
      drag.angle += dx * Math.PI * 1.6;
      drag.velocity = dx * Math.PI * 1.6;
    });
    const release = () => {
      drag.active = false;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerenter', () => (hoverTarget = 1));
    canvas.addEventListener('pointerleave', () => (hoverTarget = 0));
  }

  const stage: BustStage = {
    setProgress(value) {
      progress = MathUtils.clamp(value, 0, 1);
    },
  };

  const dustPositions = dust.geometry.getAttribute('position') as BufferAttribute;
  const start = performance.now();
  let last = start;

  const frame = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    const elapsed = (now - start) / 1000;
    const motion = reducedMotion ? 0 : 1;

    smoothProgress += (progress - smoothProgress) * (reducedMotion ? 1 : 0.08);
    pointer.cx += (pointer.x - pointer.cx) * 0.04;
    pointer.cy += (pointer.y - pointer.cy) * 0.04;

    if (isHero) {
      // Intro: the bust rises from its plinth while turning to face the visitor.
      const intro = reducedMotion ? 1 : easeOutCubic(Math.min(elapsed / INTRO_SECONDS, 1));
      renderer.toneMappingExposure = MathUtils.lerp(0.15, 1.05, intro) + hover * 0.12;

      if (!drag.active) {
        drag.velocity *= 0.94;
        drag.angle += drag.velocity;
        // Slowly return to the resting pose once the visitor lets go.
        drag.angle *= 1 - delta * 0.6;
      }
      hover += (hoverTarget - hover) * 0.06;

      // Scrolling away turns the bust into profile and lowers its gaze.
      const away = easeInOutCubic(smoothProgress);
      pivot.rotation.y =
        (1 - intro) * -1.3 +
        motion * Math.sin(elapsed * 0.25) * 0.3 * intro +
        pointer.cx * 0.35 +
        drag.angle +
        away * 1.1;
      pivot.rotation.x = pointer.cy * 0.08 + away * 0.18;
      pivot.position.y = (1 - intro) * -1.6 + motion * Math.sin(elapsed * 0.6) * 0.025 - away * 0.35;
      pivot.scale.setScalar(MathUtils.lerp(0.85, 1, intro) * (1 - away * 0.08));

      // The window light drifts, so the marble keeps catching it.
      key.position.x = -3.2 + motion * Math.sin(elapsed * 0.35) * 1.2;
      key.intensity = 60 + hover * 25;
      dust.material.opacity = 0.85 * intro;
    } else {
      // Manifesto: a dark profile that turns toward the reader as the chapters unfold,
      // and is lit fully only at the end.
      const p = easeInOutCubic(smoothProgress);
      pivot.rotation.y = MathUtils.lerp(-1.45, 0.08, p) + motion * Math.sin(elapsed * 0.3) * 0.05 + pointer.cx * 0.12;
      pivot.rotation.x = MathUtils.lerp(0.22, 0, p) + pointer.cy * 0.04;
      pivot.position.y = motion * Math.sin(elapsed * 0.5) * 0.03;
      camera.position.z = MathUtils.lerp(7.4, 5.9, p);

      key.intensity = MathUtils.lerp(2, 70, p);
      key.position.x = MathUtils.lerp(4, -3.2, p);
      ambient.intensity = MathUtils.lerp(0.05, 0.35, p);
      scene.environmentIntensity = MathUtils.lerp(0.08, 0.35, p);
      fill.intensity = MathUtils.lerp(0, 0.35, p);
      rim.intensity = MathUtils.lerp(4.5, 2.2, p);
      renderer.toneMappingExposure = MathUtils.lerp(0.75, 1.1, p);
      dust.material.opacity = MathUtils.lerp(0.15, 0.9, p);
    }

    for (let i = 0; i < DUST_COUNT && motion; i++) {
      let y = dustPositions.getY(i) + delta * (0.06 + (i % 7) * 0.012);
      if (y > 1.8) y = -1.8;
      dustPositions.setY(i, y);
      dustPositions.setX(i, dustPositions.getX(i) + Math.sin(elapsed * 0.5 + i) * delta * 0.03);
    }
    dustPositions.needsUpdate = true;

    renderer.render(scene, camera);
  };

  // Render only while on screen and the tab is visible.
  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }).observe(container);

  renderer.setAnimationLoop((now) => {
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    frame(now);
  });

  return stage;
}
