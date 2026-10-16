"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface MetalTilt {
  x: number;
  y: number;
  hover: boolean;
  onChange: () => void;
}

export type MetalDebug = "lit" | "height" | "normal" | "roughness" | "smooth" | "env";

interface MetalSurfaceProps {
  tiltRef: RefObject<MetalTilt>;
  radius?: number;
  debug?: MetalDebug;
}

const FOV = 30;
const SLAB_DEPTH = 16;
const REFLECTION_PER_TILT = 2;

const identity = {
  metalness: 1,
  roughness: 0.2,
  anisotropy: 0.72,
};

type MetalTheme = "light" | "dark";

const palettes: Record<
  MetalTheme,
  {
    color: number;
    envMapIntensity: number;
    room: { color: number; intensity: number };
    panels: { color: number; intensity: number; position: [number, number, number]; size: [number, number] }[];
  }
> = {
  light: {
    color: 0xe7e4de,
    envMapIntensity: 1.15,
    room: { color: 0xd4d2cc, intensity: 1.05 },
    panels: [
      { color: 0xf4f1ea, intensity: 2.3, position: [10, -1, 12], size: [20, 22] },
      { color: 0xd5dbe3, intensity: 2.2, position: [0, -2, 16], size: [28, 18] },
      { color: 0xb7c6d6, intensity: 1.5, position: [-14, 1, 14], size: [12, 16] },
    ],
  },
  dark: {
    color: 0x9aa3ad,
    envMapIntensity: 1.05,
    room: { color: 0x14161a, intensity: 0.85 },
    panels: [
      { color: 0x6a7078, intensity: 1.7, position: [10, -1, 12], size: [20, 22] },
      { color: 0x3c4450, intensity: 1.8, position: [0, -2, 16], size: [28, 18] },
      { color: 0x24344c, intensity: 1.45, position: [-14, 1, 14], size: [12, 16] },
    ],
  },
};

const themeOf = (dark: boolean): MetalTheme => (dark ? "dark" : "light");

const satin = {
  texels: 256,
  texelPx: 1,
  seed: 7,
  octaves: [
    { cells: 128, weight: 0.62 },
    { cells: 64, weight: 0.38 },
  ],
  grainStretch: 8,
  grainWeight: 0.3,
  slope: 1.1,
  normalScale: 0.16,
  roughnessMin: 0.17,
  roughnessMax: 0.25,
  tone: 0.035,
};

const quality = {
  maxPixelRatio: 2,
  envSigma: 0,
};

const NOOP = () => {};

const hash2 = (ix: number, iy: number) => {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(satin.seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const fade = (t: number) => t * t * (3 - 2 * t);

const wrap = (value: number, period: number) => ((value % period) + period) % period;

const periodicNoise = (u: number, v: number, cellsU: number, cellsV: number) => {
  const x = u * cellsU;
  const y = v * cellsV;
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  const tx = fade(x - gx);
  const ty = fade(y - gy);
  const x0 = wrap(gx, cellsU);
  const x1 = wrap(gx + 1, cellsU);
  const y0 = wrap(gy, cellsV);
  const y1 = wrap(gy + 1, cellsV);
  const a = hash2(x0, y0);
  const b = hash2(x1, y0);
  const c = hash2(x0, y1);
  const d = hash2(x1, y1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
};

const createSatinHeight = () => {
  const { texels, octaves, grainStretch, grainWeight } = satin;
  const height = new Float32Array(texels * texels);
  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < texels; y += 1) {
    for (let x = 0; x < texels; x += 1) {
      const u = x / texels;
      const v = y / texels;
      let h = 0;
      for (const octave of octaves) {
        h += periodicNoise(u, v, octave.cells, octave.cells) * octave.weight;
      }
      const grainCells = octaves[0].cells;
      h += periodicNoise(u, v, grainCells / grainStretch, grainCells) * grainWeight;
      height[y * texels + x] = h;
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }

  const range = max - min || 1;
  for (let i = 0; i < height.length; i += 1) {
    height[i] = (height[i] - min) / range;
  }
  return height;
};

const toTexture = (canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

const createSatin = () => {
  const { texels, slope, roughnessMin, roughnessMax, tone } = satin;
  const height = createSatinHeight();
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement("canvas");
    canvas.width = texels;
    canvas.height = texels;
    return canvas;
  });
  const [normalCanvas, roughnessCanvas, toneCanvas] = canvases;
  const contexts = canvases.map((canvas) => canvas.getContext("2d"));
  const [normalCtx, roughnessCtx, toneCtx] = contexts;

  if (normalCtx && roughnessCtx && toneCtx) {
    const normals = normalCtx.createImageData(texels, texels);
    const roughness = roughnessCtx.createImageData(texels, texels);
    const tones = toneCtx.createImageData(texels, texels);
    const at = (x: number, y: number) => height[wrap(y, texels) * texels + wrap(x, texels)];

    for (let y = 0; y < texels; y += 1) {
      for (let x = 0; x < texels; x += 1) {
        const h = at(x, y);
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * slope;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * slope;
        const nx = -dx;
        const ny = dy;
        const length = Math.hypot(nx, ny, 1);
        const index = (y * texels + x) * 4;

        normals.data[index] = (nx / length) * 127.5 + 127.5;
        normals.data[index + 1] = (ny / length) * 127.5 + 127.5;
        normals.data[index + 2] = (1 / length) * 127.5 + 127.5;
        normals.data[index + 3] = 255;

        const r = Math.round((roughnessMax - (roughnessMax - roughnessMin) * h) * 255);
        roughness.data[index] = r;
        roughness.data[index + 1] = r;
        roughness.data[index + 2] = r;
        roughness.data[index + 3] = 255;

        const t = Math.round((1 - tone + tone * h) * 255);
        tones.data[index] = t;
        tones.data[index + 1] = t;
        tones.data[index + 2] = t;
        tones.data[index + 3] = 255;
      }
    }

    normalCtx.putImageData(normals, 0, 0);
    roughnessCtx.putImageData(roughness, 0, 0);
    toneCtx.putImageData(tones, 0, 0);
  }

  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = texels;
  heightCanvas.height = texels;
  const heightCtx = heightCanvas.getContext("2d");
  if (heightCtx) {
    const image = heightCtx.createImageData(texels, texels);
    for (let i = 0; i < height.length; i += 1) {
      const value = Math.round(height[i] * 255);
      image.data[i * 4] = value;
      image.data[i * 4 + 1] = value;
      image.data[i * 4 + 2] = value;
      image.data[i * 4 + 3] = 255;
    }
    heightCtx.putImageData(image, 0, 0);
  }

  return {
    normalMap: toTexture(normalCanvas, THREE.NoColorSpace),
    roughnessMap: toTexture(roughnessCanvas, THREE.NoColorSpace),
    toneMap: toTexture(toneCanvas, THREE.SRGBColorSpace),
    heightMap: toTexture(heightCanvas, THREE.NoColorSpace),
  };
};

const createStudio = (theme: MetalTheme) => {
  const palette = palettes[theme];
  const studio = new THREE.Scene();

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(48, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: palette.room.color,
      emissiveIntensity: palette.room.intensity,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    })
  );
  studio.add(room);

  for (const panel of palette.panels) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panel.size[0], panel.size[1]),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: panel.color,
        emissiveIntensity: panel.intensity,
        roughness: 1,
        metalness: 0,
      })
    );
    mesh.position.set(panel.position[0], panel.position[1], panel.position[2]);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  }

  return studio;
};

const disposeStudio = (studio: THREE.Scene) => {
  studio.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | undefined;
    material?.dispose();
  });
};

const createSlabGeometry = (width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(r, 0);
  shape.lineTo(width - r, 0);
  shape.quadraticCurveTo(width, 0, width, r);
  shape.lineTo(width, height - r);
  shape.quadraticCurveTo(width, height, width - r, height);
  shape.lineTo(r, height);
  shape.quadraticCurveTo(0, height, 0, height - r);
  shape.lineTo(0, r);
  shape.quadraticCurveTo(0, 0, r, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: SLAB_DEPTH,
    bevelEnabled: true,
    bevelThickness: 5,
    bevelSize: 8,
    bevelOffset: -8,
    bevelSegments: 5,
    curveSegments: 16,
  });

  geometry.translate(-width / 2, -height / 2, -SLAB_DEPTH / 2);

  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) / width, uv.getY(i) / height);
  }
  uv.needsUpdate = true;

  const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const tangents = new Float32Array(normals.count * 4);
  for (let i = 0; i < normals.count; i += 1) {
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);
    let tx = Math.abs(nx) > 0.85 ? 0 : 1;
    let ty = Math.abs(nx) > 0.85 ? 1 : 0;
    let tz = 0;
    const dot = tx * nx + ty * ny + tz * nz;
    tx -= nx * dot;
    ty -= ny * dot;
    tz -= nz * dot;
    const length = Math.hypot(tx, ty, tz) || 1;
    tangents[i * 4] = tx / length;
    tangents[i * 4 + 1] = ty / length;
    tangents[i * 4 + 2] = tz / length;
    tangents[i * 4 + 3] = 1;
  }
  geometry.setAttribute("tangent", new THREE.BufferAttribute(tangents, 4));

  return geometry;
};

const readDebug = (debug?: MetalDebug): MetalDebug => {
  if (debug) {
    return debug;
  }
  const value = new URLSearchParams(window.location.search).get("metalDebug");
  const modes: MetalDebug[] = ["lit", "height", "normal", "roughness", "smooth", "env"];
  const match = modes.find((mode) => mode === value);
  if (match) {
    return match;
  }
  return "lit";
};

export const MetalSurface = ({ tiltRef, radius = 22, debug }: MetalSurfaceProps) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const mode = readDebug(debug);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.opacity = "0";
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.style.transition = "opacity 280ms ease";
    }
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    let theme = themeOf(document.documentElement.classList.contains("dark"));
    const initialStudio = createStudio(theme);
    let environment = pmrem.fromScene(initialStudio, quality.envSigma).texture;
    disposeStudio(initialStudio);
    scene.environment = environment;

    const grain = mode === "smooth" || mode === "env" ? null : createSatin();
    const grainMaps = grain ? Object.values(grain) : [];
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    for (const map of grainMaps) {
      map.anisotropy = maxAnisotropy;
    }

    const lit = mode === "lit";
    const material = new THREE.MeshPhysicalMaterial({
      color: palettes[theme].color,
      metalness: identity.metalness,
      roughness: lit ? 1 : mode === "env" ? 0.055 : identity.roughness,
      roughnessMap: lit ? grain?.roughnessMap ?? null : null,
      map: lit ? grain?.toneMap ?? null : null,
      anisotropy: lit ? identity.anisotropy : 0,
      normalMap: lit ? grain?.normalMap ?? null : null,
      normalScale: new THREE.Vector2(satin.normalScale, satin.normalScale),
      envMapIntensity: palettes[theme].envMapIntensity,
    });
    material.customProgramCacheKey = () => "brushed-metal-specular-aa";
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "material.roughness += geometryRoughness;",
        "material.roughness += geometryRoughness;\n\tvec3 brushDerivative = max( abs( dFdx( normal ) ), abs( dFdy( normal ) ) );\n\tmaterial.roughness = min( 1.0, material.roughness + max( brushDerivative.x, max( brushDerivative.y, brushDerivative.z ) ) );"
      );
    };

    const debugMap =
      mode === "height" ? grain?.heightMap : mode === "normal" ? grain?.normalMap : mode === "roughness" ? grain?.roughnessMap : undefined;
    const debugView = new THREE.MeshBasicMaterial({ map: debugMap ?? null });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), debugMap ? debugView : material);
    scene.add(mesh);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
    let size = { width: 0, height: 0 };
    let frame = 0;
    let pending = false;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let revealed = false;

    const draw = () => {
      const tilt = tiltRef.current;
      const x = reducedMotion ? 0 : tilt.x;
      const y = reducedMotion ? 0 : tilt.y;
      scene.environmentRotation.set(
        THREE.MathUtils.degToRad(-x * REFLECTION_PER_TILT),
        THREE.MathUtils.degToRad(y * REFLECTION_PER_TILT),
        0
      );
      renderer.render(scene, camera);
      if (!revealed) {
        revealed = true;
        requestAnimationFrame(() => {
          canvas.style.opacity = "1";
        });
      }
    };

    const schedule = () => {
      if (pending) {
        return;
      }
      pending = true;
      frame = requestAnimationFrame(() => {
        pending = false;
        draw();
      });
    };

    const layout = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      camera.updateProjectionMatrix();

      if (width !== size.width || height !== size.height) {
        size = { width, height };
        mesh.geometry.dispose();
        mesh.geometry = createSlabGeometry(width, height, radius);
        const tile = satin.texels * satin.texelPx;
        for (const map of grainMaps) {
          map.repeat.set(width / tile, height / tile);
        }
      }

      draw();
    };

    const applyTheme = (next: MetalTheme) => {
      if (next === theme) {
        return;
      }
      theme = next;
      const palette = palettes[theme];
      material.color.set(palette.color);
      material.envMapIntensity = palette.envMapIntensity;
      const studio = createStudio(theme);
      const nextEnvironment = pmrem.fromScene(studio, quality.envSigma).texture;
      disposeStudio(studio);
      environment.dispose();
      environment = nextEnvironment;
      scene.environment = environment;
      draw();
    };

    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(host);
    const themeObserver = new MutationObserver(() => {
      applyTheme(themeOf(document.documentElement.classList.contains("dark")));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const previous = tiltRef.current.onChange;
    tiltRef.current.onChange = schedule;

    return () => {
      cancelAnimationFrame(frame);
      if (tiltRef.current.onChange === schedule) {
        tiltRef.current.onChange = previous ?? NOOP;
      }
      observer.disconnect();
      themeObserver.disconnect();
      mesh.geometry.dispose();
      material.dispose();
      debugView.dispose();
      for (const map of grainMaps) {
        map.dispose();
      }
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [tiltRef, radius, debug]);

  return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />;
};
