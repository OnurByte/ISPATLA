'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  BloomEffect,
  EffectPass,
  FXAAEffect,
} from 'postprocessing';
import { DARK_PRESET, type SceneSettings } from './v-prism-settings';
import { createIspatlaIconGeometry } from './ispatla-icon-geometry';

const ICON_SETTINGS = { ...DARK_PRESET, ambientLight: 1.4, pointLights: 4, bloom: 1.2 };

interface VPrismProps {
  settings?: SceneSettings;
  className?: string;
}

function isLightColor(colorHex: string): boolean {
  const hex = colorHex.replace('#', '');
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

const MOBILE_BREAKPOINT = 600;

function getZoomScale(w: number): number {
  return w <= MOBILE_BREAKPOINT ? 50 : w <= 960 ? 70 : 100;
}

export function VPrism({ settings, className = '' }: VPrismProps) {
  const activeSettings = settings ?? ICON_SETTINGS;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<SceneSettings>(activeSettings);

  useEffect(() => {
    settingsRef.current = activeSettings;
  }, [activeSettings]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let animId: number;

    let width = Math.max(1, container.clientWidth || window.innerWidth);
    let height = Math.max(1, container.clientHeight || window.innerHeight);

    // --- RENDERER ---
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        alpha: false,
        depth: true,
      });
    } catch {
      return;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // --- SCENE & BACKGROUND ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(settingsRef.current.background);

    // --- ORTHOGRAPHIC CAMERA ---
    const camera = new THREE.OrthographicCamera(
      width / -2,
      width / 2,
      height / 2,
      height / -2,
      0.1,
      1000
    );
    camera.position.set(0, 0, 100);
    camera.zoom = Math.min(getZoomScale(width), height / 5);
    camera.updateProjectionMatrix();

    // --- POSTPROCESSING (BLOOM + FXAA via postprocessing) ---
    const composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
      stencilBuffer: false,
    });
    composer.addPass(new RenderPass(scene, camera));

    const bloomEffect = new BloomEffect({
      intensity: settingsRef.current.bloom,
      levels: 9,
      luminanceSmoothing: 1,
      luminanceThreshold: 1,
      mipmapBlur: true,
    });

    const fxaaPass = new EffectPass(camera, new FXAAEffect());
    const bloomPass = new EffectPass(camera, bloomEffect);
    composer.addPass(fxaaPass);
    composer.addPass(bloomPass);

    // --- LIGHTS ---
    const ambientLight = new THREE.AmbientLight(0xffffff, settingsRef.current.ambientLight);
    scene.add(ambientLight);

    const pointLights = [
      new THREE.PointLight(0xffffff, settingsRef.current.pointLights),
      new THREE.PointLight(0xffffff, settingsRef.current.pointLights),
      new THREE.PointLight(0xffffff, settingsRef.current.pointLights),
    ];
    pointLights[0].position.set(10, -10, 0);
    pointLights[1].position.set(0, 10, 0);
    pointLights[2].position.set(-10, 0, 0);
    scene.add(...pointLights);

    // Shared plane geometry
    const planeGeo = new THREE.PlaneGeometry(1, 1);

    // Prism mesh and material declarations
    let prismPhysicalMat: THREE.MeshPhysicalMaterial | null = null;
    const iconGeometry = createIspatlaIconGeometry();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- ENVIRONMENT MAP CUBE FOR CRYSTAL SPECULARITY ---
    let cubeRT: THREE.WebGLCubeRenderTarget | null = null;
    function updateEnvironment(isLight: boolean) {
      if (isLight) {
        if (!cubeRT) {
          cubeRT = new THREE.WebGLCubeRenderTarget(256);
          const envScene = new THREE.Scene();
          envScene.background = new THREE.Color('#000000');

          const addSoftbox = (intensity: number, pos: [number, number, number], scale: [number, number, number]) => {
            const mesh = new THREE.Mesh(
              planeGeo,
              new THREE.MeshBasicMaterial({
                color: new THREE.Color(intensity, intensity, intensity),
                toneMapped: false,
                side: THREE.DoubleSide,
              })
            );
            mesh.position.set(...pos);
            mesh.scale.set(...scale);
            mesh.lookAt(0, 0, 0);
            envScene.add(mesh);
          };

          addSoftbox(2.5, [0, 4, 5], [6, 3, 1]);
          addSoftbox(2.0, [-4, -1, 2], [6, 2, 1]);
          addSoftbox(2.0, [4, -1, 2], [6, 2, 1]);

          const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
          cubeCam.update(renderer, envScene);
        }
        scene.environment = cubeRT.texture;
        if (prismPhysicalMat) prismPhysicalMat.needsUpdate = true;
      } else {
        scene.environment = null;
        if (prismPhysicalMat) prismPhysicalMat.needsUpdate = true;
      }
    }
    updateEnvironment(isLightColor(settingsRef.current.background));

    // Prism Root Group
    const prismGroup = new THREE.Group();
    prismGroup.position.set(0, 0, 0);
    scene.add(prismGroup);

    prismPhysicalMat = new THREE.MeshPhysicalMaterial({
      color: '#91bfff', metalness: 0.35, roughness: 0.16,
      clearcoat: 1, iridescence: 1, iridescenceIOR: 1.5,
      emissive: '#315bf5', emissiveIntensity: 0.35,
    });
    const prismMesh = new THREE.Mesh(iconGeometry, prismPhysicalMat);
    prismGroup.add(prismMesh);
    prismGroup.rotation.set(0.12, 0, 0);
    prismGroup.updateMatrixWorld(true);

    const projectileGeometry = new THREE.SphereGeometry(0.075, 8, 6);
    const projectileMaterial = new THREE.MeshBasicMaterial({
      color: '#ff2424',
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const projectileTrailMaterial = new THREE.LineBasicMaterial({
      color: '#ff4646',
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const projectiles: Array<{
      group: THREE.Group;
      shot: THREE.Mesh;
      flash: THREE.Mesh;
      trail: THREE.Line;
      origin: THREE.Vector3;
      direction: THREE.Vector3;
      distance: number;
      elapsed: number;
      duration: number;
    }> = [];
    const muzzleLocal = new THREE.Vector3(0, 1.155, 0.22);
    const shotTarget = new THREE.Vector3();
    const shotDirection = new THREE.Vector3();
    const shotPosition = new THREE.Vector3();
    const trailStart = new THREE.Vector3();

    const fireProjectile = (clientX: number, clientY: number) => {
      prismGroup.updateMatrixWorld(true);
      const origin = muzzleLocal.clone().applyMatrix4(prismGroup.matrixWorld);
      const rect = container.getBoundingClientRect();
      shotTarget.set(
        (clientX - rect.left - width / 2) / camera.zoom,
        (height / 2 - (clientY - rect.top)) / camera.zoom,
        0
      );
      shotDirection.subVectors(shotTarget, origin).normalize();
      if (shotDirection.lengthSq() < 0.001) return;

      if (projectiles.length === 6) {
        const oldest = projectiles.shift();
        if (oldest) {
          scene.remove(oldest.group);
          oldest.trail.geometry.dispose();
        }
      }
      const group = new THREE.Group();
      group.renderOrder = 20;
      const shot = new THREE.Mesh(projectileGeometry, projectileMaterial);
      const flash = new THREE.Mesh(projectileGeometry, projectileMaterial);
      flash.scale.setScalar(2.2);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const trail = new THREE.Line(trailGeometry, projectileTrailMaterial);
      group.add(trail, shot, flash);
      scene.add(group);
      projectiles.push({
        group, shot, flash, trail, origin, direction: shotDirection.clone(), distance: origin.distanceTo(shotTarget), elapsed: 0,
        duration: reducedMotion ? 0.18 : 0.62,
      });
    }


    // --- POINTER INTERACTIONS ---
    let isPointerDown = false;
    let pointerDownAt: [number, number] | null = null;
    let pointerTargetX = 0;
    let pointerTargetY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      isPointerDown = true;
      pointerDownAt = [e.clientX, e.clientY];
      container.setPointerCapture(e.pointerId);
      setPointerTilt(e.clientX, e.clientY);
    };

    const setPointerTilt = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      pointerTargetX = THREE.MathUtils.clamp(((clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
      pointerTargetY = THREE.MathUtils.clamp(((clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || isPointerDown) {
        setPointerTilt(e.clientX, e.clientY);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const downAt = pointerDownAt;
      const rect = container.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inside && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) <= 8) {
        fireProjectile(e.clientX, e.clientY);
      }
      isPointerDown = false;
      pointerDownAt = null;
    };

    const handlePointerCancel = () => {
      isPointerDown = false;
      pointerDownAt = null;
    };

    const handlePointerLeave = () => {
      if (!isPointerDown) {
        pointerTargetX = 0;
        pointerTargetY = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        fireProjectile(rect.left + rect.width / 2, rect.top);
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);
    container.addEventListener('pointerleave', handlePointerLeave);
    container.addEventListener('keydown', handleKeyDown);

    // --- RESIZE HANDLER ---
    const handleResize = () => {
      if (!container) return;
      width = Math.max(1, container.clientWidth || window.innerWidth);
      height = Math.max(1, container.clientHeight || window.innerHeight);

      renderer.setSize(width, height, false);
      composer.setSize(width, height);

      camera.left = width / -2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = height / -2;
      camera.zoom = Math.min(getZoomScale(width), height / 5);
      camera.updateProjectionMatrix();

      prismGroup.position.set(0, 0, 0);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // --- ANIMATION LOOP ---
    let prevTime = performance.now();
    let elapsedTime = 0;
    let lastBgHex = settingsRef.current.background;
    const animate = (currentTime: number) => {
      animId = requestAnimationFrame(animate);

      const delta = Math.min((currentTime - prevTime) / 1000, 0.1);
      prevTime = currentTime;
      elapsedTime += delta;
      if (!reducedMotion) {
        prismGroup.rotation.y = THREE.MathUtils.lerp(prismGroup.rotation.y, pointerTargetX * 0.45, 0.12);
        prismGroup.rotation.x = THREE.MathUtils.lerp(prismGroup.rotation.x, 0.12 - pointerTargetY * 0.2, 0.12);
        prismPhysicalMat?.emissive.setHSL(0.58 + Math.sin(elapsedTime * 0.35) * 0.13, 0.85, 0.4);
      }
      prismGroup.updateMatrixWorld(true);
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        projectile.elapsed += delta;
        const progress = reducedMotion ? 0 : Math.min(projectile.elapsed / projectile.duration, 1);
        shotPosition.copy(projectile.origin).addScaledVector(projectile.direction, progress * projectile.distance);
        projectile.shot.position.copy(shotPosition);
        projectile.flash.position.copy(projectile.origin);
        projectile.flash.scale.setScalar(2.2 * (1 - progress));
        const points = projectile.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
        trailStart.copy(projectile.origin).addScaledVector(projectile.direction, Math.max(0, progress * projectile.distance - 0.8));
        points.setXYZ(0, trailStart.x, trailStart.y, trailStart.z);
        points.setXYZ(1, shotPosition.x, shotPosition.y, shotPosition.z);
        points.needsUpdate = true;
        if (projectile.elapsed >= projectile.duration) {
          scene.remove(projectile.group);
          projectile.trail.geometry.dispose();
          projectiles.splice(i, 1);
        }
      }

      const curSettings = settingsRef.current;
      ambientLight.intensity = THREE.MathUtils.lerp(ambientLight.intensity, curSettings.ambientLight, 0.05);

      // Sync background color & react to light mode switch
      const currentBgHex = curSettings.background;
      const isLight = isLightColor(currentBgHex);
      if (lastBgHex !== currentBgHex) {
        lastBgHex = currentBgHex;
        scene.background = new THREE.Color(currentBgHex);
        updateEnvironment(isLight);
      }

      // Sync point lights
      pointLights.forEach(pl => {
        pl.intensity = curSettings.pointLights;
      });

      // Render: in light mode, bloom is disabled to prevent blowout;
      // in dark mode, postprocessing with BloomEffect renders smoothly
      if (bloomEffect) {
        bloomEffect.intensity = isLight ? 0 : curSettings.bloom;
      }
      composer.render();
    };

    animId = requestAnimationFrame(animate);

    // --- CLEANUP ---
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
      container.removeEventListener('pointerleave', handlePointerLeave);
      container.removeEventListener('keydown', handleKeyDown);

      composer.dispose();
      cubeRT?.dispose();
      planeGeo.dispose();
      projectileGeometry.dispose();
      projectileMaterial.dispose();
      projectileTrailMaterial.dispose();
      projectiles.forEach(({ group, trail }) => {
        scene.remove(group);
        trail.geometry.dispose();
      });
      prismPhysicalMat?.dispose();
      iconGeometry.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden select-none touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${className}`}
      role="button"
      tabIndex={0}
      aria-label="Interactive Ispatla 3D symbol. Move the pointer to tilt; click or press Enter or Space to fire a light projectile."
    >
      <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full block" />
    </div>
  );
}

export default VPrism;
