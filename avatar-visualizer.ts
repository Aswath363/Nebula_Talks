/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {TalkingHead} from 'talkinghead';
import {Analyser} from './analyser';

/**
 * Avatar visualizer with lip-sync and facial expressions
 * Uses TalkingHead3D library for real-time avatar rendering
 */
@customElement('gdm-avatar-visualizer')
export class GdmAvatarVisualizer extends LitElement {
  // TalkingHead instance
  private talkingHead!: TalkingHead;

  // Audio analysers for input (microphone) and output (AI speech)
  private inputAnalyser?: Analyser;
  private outputAnalyser?: Analyser;

  // State tracking
  private isInitialized = false;
  private isStreaming = false;
  private container!: HTMLElement;

  // Audio node properties (following same pattern as visual-3d.ts)
  private _inputNode?: AudioNode;
  private _outputNode?: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    if (this.isInitialized && node) {
      this.inputAnalyser = new Analyser(node);
    }
  }

  get inputNode() {
    return this._inputNode;
  }

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    if (this.isInitialized && node) {
      this.outputAnalyser = new Analyser(node);
      this.setupAudioReactiveLipsync();
    }
  }

  get outputNode() {
    return this._outputNode;
  }

  // Smoothing for blendshape transitions
  private currentJawOpen = 0;
  private currentMouthOpen = 0;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
    }

    .avatar-container {
      width: 100%;
      height: 100%;
      position: relative;
    }

    .avatar-container canvas {
      width: 100% !important;
      height: 100% !important;
      outline: none;
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    await this.init();
  }

  /**
   * Initialize the TalkingHead avatar
   */
  private async init() {
    if (this.isInitialized) return;

    this.container = this.shadowRoot!.querySelector('.avatar-container') as HTMLElement;

    // Initialize TalkingHead with configuration
    this.talkingHead = new TalkingHead(this.container, {
      cameraView: 'upper', // Show upper body for better presence
      cameraDistance: 0,
      cameraY: 0.1,
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      lightAmbientColor: 0xffffff,
      lightAmbientIntensity: 2,
      lightDirectColor: 0x8888aa,
      lightDirectIntensity: 30,
      lightDirectPhi: 0.1,
      lightDirectTheta: 2,
      cameraRotateEnable: false,
      cameraPanEnable: false,
      cameraZoomEnable: false,
    });

    // Load the robot avatar
    try {
      await this.talkingHead.showAvatar({
        url: '/robot_playground.glb',
        body: 'M',
        avatarMood: 'neutral',
        lipsyncLang: 'en',
      });

      this.isInitialized = true;

      // Initialize analysers if nodes are already set
      if (this._inputNode) {
        this.inputAnalyser = new Analyser(this._inputNode);
      }
      if (this._outputNode) {
        this.outputAnalyser = new Analyser(this._outputNode);
        this.setupAudioReactiveLipsync();
      }

      // Set initial mood and look at camera
      this.setAvatarMood('neutral');
      this.lookAtCamera(1000);

      console.log('Avatar initialized successfully');

    } catch (error) {
      console.error('Failed to load avatar:', error);
    }
  }

  /**
   * Setup audio-reactive lip-sync animation loop
   */
  private setupAudioReactiveLipsync() {
    if (this.isStreaming) return;

    this.isStreaming = true;
    this.updateLipsyncFromAudio();
  }

  /**
   * Main animation loop - updates blendshapes based on audio
   */
  private updateLipsyncFromAudio() {
    const update = () => {
      if (!this.isInitialized) {
        requestAnimationFrame(update);
        return;
      }

      // Update audio analysers
      if (this.outputAnalyser) {
        this.outputAnalyser.update();
      }
      if (this.inputAnalyser) {
        this.inputAnalyser.update();
      }

      // Calculate audio features for lip-sync from output (AI speech)
      if (this.outputAnalyser) {
        const audioData = this.outputAnalyser.data;

        // Calculate average volume from low-mid frequencies
        const bass = audioData[0] || 0;
        const mid = audioData[1] || 0;
        const treble = audioData[2] || 0;
        const averageVolume = (bass + mid + treble) / 3;

        // Normalize to 0-1 range (adjust sensitivity as needed)
        const normalizedVolume = Math.min(averageVolume / 80, 1);

        // Apply smoothing for more natural movement
        const smoothingFactor = 0.3;
        this.currentJawOpen = this.currentJawOpen * (1 - smoothingFactor) + normalizedVolume * smoothingFactor;
        this.currentMouthOpen = this.currentMouthOpen * (1 - smoothingFactor) + (normalizedVolume * 0.7) * smoothingFactor;

        // Update blendshapes
        this.updateBlendshapesFromAudio(this.currentJawOpen, this.currentMouthOpen);
      }

      requestAnimationFrame(update);
    };
    update();
  }

  /**
   * Update avatar blendshapes based on audio volume
   * This creates the lip-sync effect without needing viseme data
   */
  private updateBlendshapesFromAudio(jawOpen: number, mouthOpen: number) {
    if (!this.talkingHead || !this.talkingHead.mtAvatar) return;

    const mt = this.talkingHead.mtAvatar;

    // Primary jaw movement - scales with audio volume
    if (mt['jawOpen']) {
      Object.assign(mt['jawOpen'], {
        realtime: jawOpen * 0.9,
        needsUpdate: true,
      });
    }

    // Mouth opening
    if (mt['mouthOpen']) {
      Object.assign(mt['mouthOpen'], {
        realtime: mouthOpen * 0.7,
        needsUpdate: true,
      });
    }

    // Mouth stretch for natural width variation
    if (mt['mouthStretchLeft']) {
      Object.assign(mt['mouthStretchLeft'], {
        realtime: mouthOpen * 0.25,
        needsUpdate: true,
      });
    }
    if (mt['mouthStretchRight']) {
      Object.assign(mt['mouthStretchRight'], {
        realtime: mouthOpen * 0.25,
        needsUpdate: true,
      });
    }

    // Subtle smile for friendly robot appearance
    if (mt['mouthSmileLeft']) {
      Object.assign(mt['mouthSmileLeft'], {
        realtime: 0.1 + (mouthOpen * 0.05),
        needsUpdate: true,
      });
    }
    if (mt['mouthSmileRight']) {
      Object.assign(mt['mouthSmileRight'], {
        realtime: 0.1 + (mouthOpen * 0.05),
        needsUpdate: true,
      });
    }

    // Oculus viseme blendshapes (alternative approach)
    // These are commonly used for lip-sync
    const visemeMap = [
      { name: 'viseme_sil', value: 1 - jawOpen },
      { name: 'viseme_PP', value: jawOpen * 0.1 },
      { name: 'viseme_O', value: jawOpen * 0.3 },
      { name: 'viseme_aa', value: jawOpen * 0.2 },
    ];

    for (const viseme of visemeMap) {
      if (mt[viseme.name]) {
        Object.assign(mt[viseme.name], {
          realtime: viseme.value,
          needsUpdate: true,
        });
      }
    }
  }

  /**
   * Set avatar mood/expression
   * Supported moods: neutral, happy, sad, angry, fear, disgust, love, sleep
   */
  setAvatarMood(mood: 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised') {
    if (!this.talkingHead) return;

    const moodMap: Record<string, string> = {
      'neutral': 'neutral',
      'happy': 'happy',
      'sad': 'sad',
      'angry': 'angry',
      'surprised': 'love', // Close approximation for surprised/excited
    };

    this.talkingHead.setMood(moodMap[mood] || 'neutral');
  }

  /**
   * Make avatar look at a specific screen position
   * @param x - Horizontal position (-1 to 1)
   * @param y - Vertical position (-1 to 1)
   * @param duration - Duration in milliseconds
   */
  lookAt(x: number, y: number, duration: number = 1000) {
    if (!this.talkingHead) return;
    this.talkingHead.lookAt(x, y, duration);
  }

  /**
   * Make avatar look at camera
   * @param duration - Duration in milliseconds
   */
  lookAtCamera(duration: number = 1000) {
    if (!this.talkingHead) return;
    this.talkingHead.lookAtCamera(duration);
  }

  /**
   * Play a gesture animation
   * @param name - Gesture name (e.g., 'thumbup', 'handup', 'wave')
   * @param duration - Duration in milliseconds
   */
  playGesture(name: string, duration: number = 2000) {
    if (!this.talkingHead) return;
    this.talkingHead.playGesture(name, duration);
  }

  render() {
    return html`<div class="avatar-container"></div>`;
  }

  disconnectedCallback() {
    // Cleanup when component is removed
    if (this.isStreaming && this.talkingHead) {
      this.talkingHead.streamStop?.();
    }
    super.disconnectedCallback();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-avatar-visualizer': GdmAvatarVisualizer;
  }
}
