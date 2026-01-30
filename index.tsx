/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() personDetected = false;
  @state() detectionActive = false;
  @state() showOrb = false;
  @state() isSpacePressed = false;

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private videoContext: CanvasRenderingContext2D;
  private videoFrameInterval: number;
  private detectionCanvas: HTMLCanvasElement;
  private detectionContext: CanvasRenderingContext2D;
  private cocoModel: any;
  private personDetectionInterval: number;
  private noPersonCount = 0;
  private personPresentCount = 0;
  private hasGreeted = false;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;

  static styles = css`
    * {
      box-sizing: border-box;
    }

    .landing-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #0a0015 0%, #1a0a2e 50%, #0f1729 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 100;
      animation: fadeIn 0.5s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .landing-screen.fade-out {
      animation: fadeOut 0.8s ease-out forwards;
    }

    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .nebula-logo {
      font-size: 72px;
      font-weight: bold;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 20px;
      text-align: center;
      letter-spacing: 2px;
    }

    .nebula-subtitle {
      font-size: 28px;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 60px;
      font-family: sans-serif;
      font-weight: 300;
    }

    .detection-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
    }

    .detection-ring {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      border: 3px solid rgba(102, 126, 234, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      animation: breathe 3s ease-in-out infinite;
    }

    @keyframes breathe {
      0%, 100% { transform: scale(1); box-shadow: 0 0 30px rgba(102, 126, 234, 0.3); }
      50% { transform: scale(1.05); box-shadow: 0 0 50px rgba(102, 126, 234, 0.5); }
    }

    .detection-ring.detecting {
      border-color: rgba(255, 214, 0, 0.6);
      animation: scan 2s linear infinite;
    }

    @keyframes scan {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .detection-ring::before {
      content: '';
      position: absolute;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: rgba(102, 126, 234, 0.6);
      animation: spin 4s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .detection-icon {
      font-size: 64px;
    }

    .detection-text {
      font-size: 20px;
      color: rgba(255, 255, 255, 0.9);
      font-family: sans-serif;
      text-align: center;
      max-width: 400px;
    }

    .detection-status {
      padding: 12px 24px;
      border-radius: 30px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .detection-status.waiting {
      background: linear-gradient(135deg, #ffd600 0%, #ffab00 100%);
      color: #000;
    }

    .detection-status.detected {
      background: linear-gradient(135deg, #00c853 0%, #00e676 100%);
      color: white;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    .landing-preview {
      width: 240px;
      height: 180px;
      border-radius: 16px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      object-fit: cover;
      transform: scaleX(-1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .orb-space {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
    }

    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: sans-serif;
      font-size: 14px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }

    #detectionStatus {
      position: absolute;
      top: 20px;
      left: 20px;
      padding: 12px 20px;
      border-radius: 12px;
      z-index: 10;
      color: white;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    #detectionStatus.active {
      background: linear-gradient(135deg, #00c853 0%, #00e676 100%);
      border: 2px solid #00c853;
    }

    #detectionStatus.inactive {
      background: linear-gradient(135deg, #ff5252 0%, #ff1744 100%);
      border: 2px solid #ff5252;
    }

    #detectionStatus.waiting {
      background: linear-gradient(135deg, #ffd600 0%, #ffab00 100%);
      border: 2px solid #ffd600;
      color: #000;
    }

    #detectionDot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: white;
      animation: pulse 1.5s infinite;
    }

    #videoPreview {
      position: absolute;
      top: 80px;
      right: 20px;
      width: 160px;
      height: 120px;
      border-radius: 12px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      object-fit: cover;
      z-index: 10;
      transform: scaleX(-1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .push-to-talk-indicator {
      position: absolute;
      bottom: 15vh;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 28px;
      border-radius: 40px;
      z-index: 10;
      font-family: sans-serif;
      font-size: 16px;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    }

    .push-to-talk-indicator.idle {
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid rgba(255, 255, 255, 0.3);
      color: rgba(255, 255, 255, 0.7);
    }

    .push-to-talk-indicator.listening {
      background: linear-gradient(135deg, #00c853 0%, #00e676 100%);
      border: 2px solid #00c853;
      color: white;
      animation: glow 1.5s ease-in-out infinite;
    }

    @keyframes glow {
      0%, 100% { box-shadow: 0 6px 24px rgba(0, 200, 83, 0.4); }
      50% { box-shadow: 0 6px 40px rgba(0, 200, 83, 0.7); }
    }

    .ptt-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ptt-key {
      display: inline-block;
      padding: 4px 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      font-family: monospace;
      font-size: 14px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
    this.loadCocoModel();
    this.initDetectionCamera();
  }

  private async loadCocoModel() {
    this.updateStatus('Loading person detection model...');
    try {
      // Wait for coco-ssd to be available
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.cocoModel = await (window as any).cocoSsd.load();
      this.updateStatus('Person detection ready. Waiting for visitor...');
      this.detectionActive = true;
      this.startPersonDetection();
    } catch (err) {
      console.error('Error loading COCO-SSD:', err);
      this.updateStatus('Detection model failed to load. Use manual start.');
    }
  }

  private async initDetectionCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true,
      });
      this.mediaStream = stream;
      this.updateStatus('Camera ready for person detection...');
    } catch (err) {
      console.error('Error accessing camera:', err);
      this.updateStatus('Camera access denied. Manual start required.');
    }
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
          systemInstruction: `You are the witty, observant, and welcoming AI Receptionist for "Nebula Talks".

Context:
You are manning the front desk for an event about Visual Intelligence (Computer Vision) and how it automates decision-making. When a person approaches, you automatically start the conversation.

Protocol:
1. AUTO-GREET: When the session starts, immediately welcome the visitor to "Nebula Talks" with energy! Ask for their name.
2. OBSERVATION & HUMOR: Once they reply with their name, LOOK at the video feed. Address them by name and make a fun, lighthearted, and engaging comment about their appearance, background, or current "vibe". Be humorous!
3. BRIEF: Explain that the session is about "giving machines eyes" (Computer Vision).
4. CHECK: Ask if they have any questions before they head in.
5. CLOSING:
   - If they have a question: Answer it briefly.
   - If they say "no" or after you answer: Say goodbye with a funny remark and end with "Enjoy the session!"

IMPORTANT: When the session starts (you hear audio begin), IMMEDIATELY start with your greeting. Don't wait for the user to speak first - YOU initiate the conversation!

Tone: Energetic, funny, professional but casual.`,
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startPersonDetection() {
    if (!this.cocoModel || !this.mediaStream) return;

    // Create detection video element
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.srcObject = this.mediaStream;
    this.videoElement.playsInline = true;

    // Create detection canvas
    this.detectionCanvas = document.createElement('canvas');
    this.detectionCanvas.width = 640;
    this.detectionCanvas.height = 480;
    this.detectionContext = this.detectionCanvas.getContext('2d');

    // Wait for video to be ready
    this.videoElement.onloadedmetadata = async () => {
      await this.videoElement.play();

      // Connect to landing preview element initially
      const landingPreview = this.shadowRoot?.querySelector('#landingPreview') as HTMLVideoElement;
      if (landingPreview) {
        landingPreview.srcObject = this.mediaStream;
        landingPreview.play();
      }

      // Start detection loop
      this.detectPersons();
    };
  }

  private connectToOrbPreview() {
    // Connect to orb preview element when transitioning to orb
    const orbPreview = this.shadowRoot?.querySelector('#videoPreview') as HTMLVideoElement;
    if (orbPreview) {
      orbPreview.srcObject = this.mediaStream;
      orbPreview.play();
    }
  }

  private async detectPersons() {
    if (!this.cocoModel || !this.videoElement) return;

    // Run detection every 500ms
    this.personDetectionInterval = window.setInterval(async () => {
      try {
        // Draw current frame to detection canvas
        this.detectionContext.drawImage(this.videoElement, 0, 0, 640, 480);

        // Run COCO-SSD detection
        const predictions = await this.cocoModel.detect(this.detectionCanvas);

        // Check if any 'person' is detected
        const personFound = predictions.some(p => p.class === 'person' && p.score > 0.6);

        if (personFound) {
          this.noPersonCount = 0;
          this.personPresentCount++;

          // Person detected - immediately transition to orb and start recording
          if (!this.isRecording) {
            this.personDetected = true;
            this.showOrb = true;
            this.hasGreeted = false;
            await this.startRecording();
          }
        } else {
          this.personPresentCount = 0;
          this.noPersonCount++;

          // No person detected - immediately stop recording and go back to landing
          if (this.isRecording) {
            this.personDetected = false;
            this.showOrb = false;
            this.hasGreeted = false;
            await this.stopRecording();
            this.reset(); // Reset session for next visitor
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
      }
    }, 500);
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    // If we don't have a media stream yet (manual start), request one
    if (!this.mediaStream) {
      this.updateStatus('Requesting camera and microphone access...');
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        this.updateStatus('Camera and microphone access granted. Starting capture...');
      } catch (err) {
        console.error('Error getting media stream:', err);
        this.updateStatus(`Error: ${err.message}`);
        return;
      }
    } else {
      this.updateStatus('Starting recording session...');
    }

    try {

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        // Only send audio when spacebar is held (push-to-talk)
        if (this.isSpacePressed) {
          this.session.sendRealtimeInput({media: createBlob(pcmData)});
        }
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      // Setup video capture for streaming to AI
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.srcObject = this.mediaStream;
      }

      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = 640;
      this.canvasElement.height = 480;
      this.videoContext = this.canvasElement.getContext('2d');

      // Wait for video to be ready or use existing
      const setupVideoStreaming = () => {
        // Connect to orb preview element
        this.connectToOrbPreview();

        // Start sending video frames
        this.videoFrameInterval = window.setInterval(() => {
          if (!this.isRecording) return;

          this.videoContext.drawImage(this.videoElement, 0, 0, 640, 480);
          const base64Data = this.canvasElement.toDataURL('image/jpeg', 0.7);

          // Send video frame to Gemini
          this.session.sendRealtimeInput({
            media: {
              mimeType: 'image/jpeg',
              data: base64Data.split(',')[1],
            },
          });
        }, 1000); // Send frame every second
      };

      if (this.videoElement.readyState >= 2) {
        setupVideoStreaming();
      } else {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();
          setupVideoStreaming();
        };
      }

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Hold SPACEBAR to talk');

      // Setup push-to-talk with spacebar
      this.handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space' && !this.isSpacePressed) {
          e.preventDefault();
          this.isSpacePressed = true;
          this.updateStatus('🎤 Listening... Release SPACEBAR to stop');
        }
      };

      this.handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          e.preventDefault();
          this.isSpacePressed = false;
          this.updateStatus('🔴 Recording... Hold SPACEBAR to talk');
        }
      };

      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);

      // Send a text trigger to prompt the AI to start its greeting
      setTimeout(() => {
        this.session.sendRealtimeInput({
          text: 'A visitor has arrived. Please greet them.'
        });
      }, 500);
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording) return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;
    this.isSpacePressed = false;

    // Cleanup keyboard event listeners
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.handleKeyDown = null;
    }
    if (this.handleKeyUp) {
      window.removeEventListener('keyup', this.handleKeyUp);
      this.handleKeyUp = null;
    }

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    // Cleanup video streaming resources but keep the media stream for detection
    if (this.videoFrameInterval) {
      clearInterval(this.videoFrameInterval);
      this.videoFrameInterval = null;
    }
    if (this.canvasElement) {
      this.canvasElement = null;
    }
    if (this.videoContext) {
      this.videoContext = null;
    }

    // Keep mediaStream and videoElement for person detection
    // Keep preview element active

    this.updateStatus('Person left. Waiting for next visitor...');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  render() {
    const detectionClass = this.personDetected ? 'active' : (this.detectionActive ? 'waiting' : 'inactive');
    const detectionText = this.personDetected ? '👤 Person Detected' : (this.detectionActive ? '👁️ Detecting...' : '⚫ Inactive');
    const landingStatusClass = this.personDetected ? 'detected' : 'waiting';
    const landingStatusText = this.personDetected ? '✓ Visitor Detected' : '○ Looking for visitors...';

    // Landing screen (shown when no person detected)
    const landingScreen = html`
      <div class="landing-screen">
        <div class="nebula-logo">NEBULA TALKS</div>
        <div class="nebula-subtitle">Visual Intelligence Experience</div>

        <div class="detection-container">
          <div class="detection-ring ${this.detectionActive ? 'detecting' : ''}">
            <div class="detection-icon">${this.personDetected ? '👤' : '👁️'}</div>
          </div>

          <div class="detection-text">
            ${this.personDetected
              ? 'Welcome! Please step forward...'
              : 'Stand in front of the camera to begin'}
          </div>

          <div class="detection-status ${landingStatusClass}">
            <div class="status-dot"></div>
            <span>${landingStatusText}</span>
          </div>

          <video id="landingPreview" class="landing-preview" muted autoplay playsinline></video>
        </div>
      </div>
    `;

    // Orb space (shown when person detected)
    const orbSpace = html`
      <div class="orb-space">
        <div id="detectionStatus" class="${detectionClass}">
          <div id="detectionDot"></div>
          <span>${detectionText}</span>
        </div>
        <video id="videoPreview" muted autoplay playsinline></video>
        <div class="controls" style="${this.detectionActive ? 'display: none;' : ''}">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div class="push-to-talk-indicator ${this.isSpacePressed ? 'listening' : 'idle'}">
          <div class="ptt-icon">${this.isSpacePressed ? '🎤' : '📢'}</div>
          <span>${this.isSpacePressed ? 'Listening...' : 'Hold '}</span>
          <span class="ptt-key">SPACE</span>
          <span>${this.isSpacePressed ? ' Release to stop' : ' to talk'}</span>
        </div>

        <div id="status"> ${this.error} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;

    return html`
      ${this.showOrb ? orbSpace : landingScreen}
    `;
  }
}
