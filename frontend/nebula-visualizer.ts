/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Nebula Visualizer - Spectacular pulsating nebula cloud in space
 * Audio-reactive particle system with volumetric gas appearance
 */
@customElement('nebula-visualizer')
export class NebulaVisualizer extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;

  // Nebula particle systems
  private nebulaParticles!: THREE.Points;
  private coreParticles!: THREE.Points;
  private starField!: THREE.Points;

  // Animation state
  private prevTime = 0;
  private rotation = 0;
  private pulsePhase = 0;
  private currentScale = 1;
  private targetScale = 1;

  // Shaders
  private nebulaUniforms!: { [key: string]: THREE.IUniform };
  private coreUniforms!: { [key: string]: THREE.IUniform };

  private _outputNode!: AudioNode;
  private _inputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      image-rendering: pixelated;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0015);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 8);
    this.camera = camera;

    // Renderer
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create nebula particle systems
    this.createNebulaParticles(scene);
    this.createCoreParticles(scene);
    this.createStarField(scene);

    // Post-processing with bloom
    this.setupPostProcessing(renderer, scene);

    // Handle resize
    window.addEventListener('resize', () => this.onResize(renderer, scene));
    this.onResize(renderer, scene);

    // Start animation
    this.prevTime = performance.now();
    this.animation();
  }

  private createNebulaParticles(scene: THREE.Scene) {
    // Volumetric nebula gas cloud with multiple colored layers
    const particleCount = 15000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const randomness = new Float32Array(particleCount * 3);

    // Nebula color palette - cosmic colors
    const colorPalette = [
      new THREE.Color(0x8b5cf6), // Purple
      new THREE.Color(0xec4899), // Pink
      new THREE.Color(0x06b6d4), // Cyan
      new THREE.Color(0x3b82f6), // Blue
      new THREE.Color(0xf472b6), // Light pink
      new THREE.Color(0xa855f7), // Light purple
      new THREE.Color(0x14b8a6), // Teal
    ];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Spherical distribution with organic clustering
      const radius = Math.random() * 4 + 1;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      // Add clustering for cloud-like appearance
      const clusterOffset = this.perlinNoise(i * 0.1) * 1.5;

      positions[i3] = (radius + clusterOffset) * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = (radius + clusterOffset) * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i3 + 2] = (radius + clusterOffset) * Math.cos(phi);

      // Assign colors from palette with mixing
      const colorIndex = Math.floor(Math.random() * colorPalette.length);
      const nextColorIndex = (colorIndex + 1) % colorPalette.length;
      const mixRatio = Math.random();

      const color1 = colorPalette[colorIndex];
      const color2 = colorPalette[nextColorIndex];
      const finalColor = color1.clone().lerp(color2, mixRatio);

      // Add color variation
      const variation = (Math.random() - 0.5) * 0.2;
      colors[i3] = Math.max(0, Math.min(1, finalColor.r + variation));
      colors[i3 + 1] = Math.max(0, Math.min(1, finalColor.g + variation));
      colors[i3 + 2] = Math.max(0, Math.min(1, finalColor.b + variation));

      // Varying particle sizes for depth
      sizes[i] = Math.random() * 8 + 2;

      // Random motion parameters
      randomness[i3] = (Math.random() - 0.5) * 2;
      randomness[i3 + 1] = (Math.random() - 0.5) * 2;
      randomness[i3 + 2] = (Math.random() - 0.5) * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('randomness', new THREE.BufferAttribute(randomness, 3));

    // Custom shader for nebula particles
    this.nebulaUniforms = {
      time: { value: 0 },
      pulseStrength: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.nebulaUniforms,
      vertexShader: `
        attribute float size;
        attribute vec3 randomness;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float time;
        uniform float pulseStrength;

        void main() {
          vColor = color;

          // Organic swirling motion
          vec3 pos = position;
          float angle = time * 0.1 + randomness.x * 0.5;
          float s = sin(angle);
          float c = cos(angle);

          // Swirl around Y axis
          pos.xz = mat2(c, -s, s, c) * pos.xz;

          // Gentle wave motion
          pos.y += sin(time * 0.5 + pos.x * 0.5) * 0.3;

          // Audio-reactive expansion
          float expansion = 1.0 + pulseStrength * 0.5;
          pos *= expansion;

          // Pulsating size
          float pulse = 1.0 + sin(time * 2.0 + randomness.y * 10.0) * (0.2 + pulseStrength * 0.3);
          float particleSize = size * pulse * (1.0 + pulseStrength * 0.5);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

          // Size attenuation with distance
          gl_PointSize = particleSize * (300.0 / -mvPosition.z);

          gl_Position = projectionMatrix * mvPosition;

          // Fade edges for soft appearance
          float distFromCenter = length(pos.xy);
          vAlpha = 1.0 - smoothstep(2.0, 4.0, distFromCenter);
          vAlpha *= 0.6 + pulseStrength * 0.4; // Brighter when loud
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Soft circular particle with glow
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);

          // Inner glow
          float innerGlow = exp(-dist * 4.0);
          alpha = mix(alpha, innerGlow, 0.7);

          gl_FragColor = vec4(vColor, alpha * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.nebulaParticles = new THREE.Points(geometry, material);
    scene.add(this.nebulaParticles);
  }

  private createCoreParticles(scene: THREE.Scene) {
    // Bright core of the nebula
    const particleCount = 5000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Dense spherical core
      const radius = Math.pow(Math.random(), 0.5) * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Hot core colors (white to cyan to blue)
      const t = radius / 1.5;
      if (t < 0.3) {
        colors[i3] = 1.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 1.0;
      } else if (t < 0.6) {
        colors[i3] = 0.8;
        colors[i3 + 1] = 0.9;
        colors[i3 + 2] = 1.0;
      } else {
        colors[i3] = 0.5;
        colors[i3 + 1] = 0.7;
        colors[i3 + 2] = 1.0;
      }

      sizes[i] = (1.0 - t) * 10 + 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.coreUniforms = {
      time: { value: 0 },
      pulseStrength: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.coreUniforms,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float time;
        uniform float pulseStrength;

        void main() {
          vColor = color;

          vec3 pos = position;

          // Faster rotation for core
          float angle = time * 0.3;
          float s = sin(angle);
          float c = cos(angle);
          pos.xz = mat2(c, -s, s, c) * pos.xz;

          // Stronger pulse in core
          float expansion = 1.0 + pulseStrength * 0.8;
          pos *= expansion;

          // Turbulent motion
          pos += sin(time * 2.0 + pos * 3.0) * 0.05 * pulseStrength;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (1.0 + pulseStrength) * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;

        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);

          // Intense core glow
          float alpha = exp(-dist * 6.0);

          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.coreParticles = new THREE.Points(geometry, material);
    scene.add(this.coreParticles);
  }

  private createStarField(scene: THREE.Scene) {
    // Background stars
    const starCount = 3000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;

      // Spread stars across background
      const radius = 20 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Star colors (white, blue-white, yellow-white)
      const starType = Math.random();
      if (starType < 0.7) {
        // White
        colors[i3] = 1.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 1.0;
      } else if (starType < 0.85) {
        // Blue-white
        colors[i3] = 0.8;
        colors[i3 + 1] = 0.9;
        colors[i3 + 2] = 1.0;
      } else {
        // Yellow-white
        colors[i3] = 1.0;
        colors[i3 + 1] = 0.95;
        colors[i3 + 2] = 0.8;
      }

      sizes[i] = Math.random() * 3 + 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        varying float vTwinkle;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;

          // Twinkle effect
          vTwinkle = 0.5 + 0.5 * sin(position.x * 10.0 + time * 2.0);
        }
      `,
      fragmentShader: `
        varying float vTwinkle;

        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);

          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * vTwinkle);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starField = new THREE.Points(geometry, material);
    scene.add(this.starField);
  }

  private setupPostProcessing(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const renderPass = new RenderPass(scene, this.camera);

    // Strong bloom for nebula glow
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      2.0,  // strength - increased for more glow
      0.5,  // radius
      0.1   // threshold
    );

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(bloomPass);
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    // Update analysers
    if (this.inputAnalyser) {
      this.inputAnalyser.update();
    }
    if (this.outputAnalyser) {
      this.outputAnalyser.update();
    }

    const t = performance.now();
    const dt = (t - this.prevTime) / 1000;
    this.prevTime = t;

    // Get audio levels
    let audioLevel = 0;
    if (this.outputAnalyser) {
      const data = this.outputAnalyser.data;
      audioLevel = Math.max(...data) / 255;
    }

    // Smooth audio level for more organic response
    this.targetScale = 1 + audioLevel * 1.5;
    this.currentScale += (this.targetScale - this.currentScale) * 0.1;

    // Update uniforms
    const time = t * 0.001;
    this.nebulaUniforms.time.value = time;
    this.nebulaUniforms.pulseStrength.value = this.currentScale - 1;

    if (this.coreUniforms) {
      this.coreUniforms.time.value = time;
      this.coreUniforms.pulseStrength.value = this.currentScale - 1;
    }

    // Slow rotation
    this.rotation += dt * 0.05;
    if (this.nebulaParticles) {
      this.nebulaParticles.rotation.y = this.rotation;
      this.nebulaParticles.rotation.z = Math.sin(time * 0.1) * 0.1;
    }

    if (this.coreParticles) {
      this.coreParticles.rotation.y = this.rotation * 1.5;
    }

    // Update star twinkle
    if (this.starField) {
      const starMaterial = this.starField.material as THREE.ShaderMaterial;
      starMaterial.uniforms.time.value = time;
    }

    // Render
    if (this.composer) {
      this.composer.render();
    }
  }

  private onResize(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    if (!this.camera) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    renderer.setSize(width, height);

    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  // Simple noise function for organic distribution
  private perlinNoise(x: number): number {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const fade = x * x * (3 - 2 * x);
    return (Math.sin(X * 12.9898 + 78.233) * 43758.5453) % 1 * fade +
           (Math.sin((X + 1) * 12.9898 + 78.233) * 43758.5453) % 1 * (1 - fade);
  }

  protected firstUpdated() {
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'nebula-visualizer': NebulaVisualizer;
  }
}
