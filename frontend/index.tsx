/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData, detectPersonInFrame, checkDetectionBackendHealth} from './utils';
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

  @query('#videoPreview')
  videoPreview: HTMLVideoElement;

  @query('#landingPreview')
  landingPreview: HTMLVideoElement;

  private client: GoogleGenAI;
  private session: Session;
  private eventPrompt: any = null;
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
  private personDetectionInterval: number;
  private noPersonCount = 0;
  private personPresentCount = 0;
  private hasGreeted = false;

  // Backend detection properties
  private backendHealthy = false;
  private frameCounter = 0;
  private frameSkipCount = 2; // Send every 3rd frame to reduce load
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
      background: radial-gradient(ellipse at center top, #1a1a3e 0%, #0d0d1a 50%, #050508 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 100;
      animation: fadeIn 0.8s ease-out;
      overflow: hidden;
    }

    .landing-screen::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(120, 100, 255, 0.03) 0%, transparent 50%);
      animation: drift 20s linear infinite;
    }

    @keyframes drift {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .landing-screen::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        radial-gradient(circle at 20% 80%, rgba(120, 100, 255, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 80% 20%, rgba(255, 100, 150, 0.05) 0%, transparent 40%);
      pointer-events: none;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }

    .landing-screen.fade-out {
      animation: fadeOut 1s ease-out forwards;
    }

    @keyframes fadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(1.05); }
    }

    .nebula-logo {
      font-size: 64px;
      font-weight: 800;
      background: linear-gradient(135deg, #a78bfa 0%, #818cf8 25%, #6366f1 50%, #818cf8 75%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 12px;
      text-align: center;
      letter-spacing: 8px;
      position: relative;
      text-shadow: 0 0 60px rgba(139, 92, 246, 0.5);
      animation: shimmer 3s ease-in-out infinite;
    }

    @keyframes shimmer {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.2); }
    }

    .nebula-subtitle {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 80px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 400;
      letter-spacing: 6px;
      text-transform: uppercase;
      position: relative;
    }

    .nebula-subtitle::before,
    .nebula-subtitle::after {
      content: '';
      position: absolute;
      top: 50%;
      width: 60px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.5), transparent);
    }

    .nebula-subtitle::before {
      right: calc(100% + 20px);
    }

    .nebula-subtitle::after {
      left: calc(100% + 20px);
    }

    .detection-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      z-index: 1;
    }

    .detection-ring {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%);
    }

    .detection-ring::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: rgba(167, 139, 250, 0.6);
      animation: spin 3s linear infinite;
    }

    .detection-ring::after {
      content: '';
      position: absolute;
      width: 85%;
      height: 85%;
      border-radius: 50%;
      border: 1px solid transparent;
      border-bottom-color: rgba(167, 139, 250, 0.3);
      animation: spin 4s linear infinite reverse;
    }

    .detection-ring.detecting {
      animation: detectingPulse 2s ease-in-out infinite;
    }

    .detection-ring.detecting::before {
      border-top-color: rgba(74, 222, 128, 0.8);
      animation: spin 1s linear infinite;
    }

    @keyframes detectingPulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4);
      }
      50% {
        box-shadow: 0 0 0 20px rgba(74, 222, 128, 0);
      }
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .detection-icon {
      font-size: 56px;
      filter: drop-shadow(0 0 20px rgba(167, 139, 250, 0.6));
      animation: iconFloat 3s ease-in-out infinite;
    }

    @keyframes iconFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }

    .detection-text {
      font-size: 18px;
      color: rgba(255, 255, 255, 0.7);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
      max-width: 380px;
      font-weight: 300;
      letter-spacing: 0.5px;
      line-height: 1.6;
    }

    .detection-status {
      padding: 14px 28px;
      border-radius: 50px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: 1px;
      text-transform: uppercase;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .detection-status.waiting {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%);
      color: rgba(251, 191, 36, 0.9);
      border-color: rgba(251, 191, 36, 0.2);
      box-shadow: 0 0 30px rgba(251, 191, 36, 0.1);
    }

    .detection-status.detected {
      background: linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(34, 197, 94, 0.15) 100%);
      color: rgba(74, 222, 128, 0.9);
      border-color: rgba(74, 222, 128, 0.2);
      box-shadow: 0 0 30px rgba(74, 222, 128, 0.2);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 2s ease-in-out infinite;
      box-shadow: 0 0 10px currentColor;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.3); }
    }

    .landing-preview {
      width: 220px;
      height: 165px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      object-fit: cover;
      transform: scaleX(-1);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.4),
        0 0 60px rgba(139, 92, 246, 0.1);
      backdrop-filter: blur(10px);
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
    this.checkBackendHealth();
    this.initDetectionCamera();
  }

  override firstUpdated() {
    super.firstUpdated();
    // Initial connection of video stream after DOM is ready
    this.connectVideoStream();
  }

  override updated(changedProperties: Map<PropertyKey, unknown>) {
    super.updated(changedProperties);

    // When showOrb changes, reconnect the video stream to the appropriate preview
    if (changedProperties.has('showOrb')) {
      this.connectVideoStream();
    }
  }

  private connectVideoStream() {
    if (!this.mediaStream) return;

    if (this.showOrb) {
      // Connect to orb preview
      if (this.videoPreview) {
        this.videoPreview.srcObject = this.mediaStream;
        this.videoPreview.play().catch(err => console.error('Error playing video preview:', err));
      }
    } else {
      // Connect to landing preview
      if (this.landingPreview) {
        this.landingPreview.srcObject = this.mediaStream;
        this.landingPreview.play().catch(err => console.error('Error playing landing preview:', err));
      }
    }
  }

  private async checkBackendHealth() {
    this.updateStatus('Connecting to detection backend...');

    // Retry connection up to 5 times
    for (let i = 0; i < 5; i++) {
      try {
        const healthy = await checkDetectionBackendHealth();
        if (healthy) {
          this.backendHealthy = true;
          this.updateStatus('Detection backend ready. Waiting for visitor...');
          this.detectionActive = true;
          this.startPersonDetection();
          return;
        }
      } catch (err) {
        console.error(`Backend connection attempt ${i + 1} failed:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    this.updateStatus('Backend unavailable. Manual start required.');
    this.detectionActive = false;
  }

  private async initDetectionCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true,
      });
      this.mediaStream = stream;
      this.updateStatus('Camera ready for person detection...');

      // Wait for DOM to be ready, then connect the stream
      setTimeout(() => this.connectVideoStream(), 100);
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

    // Fetch API key and event prompt from backend
    let apiKey: string;
    try {
      const response = await fetch('http://localhost:8000/api/config');
      if (!response.ok) {
        throw new Error('Failed to fetch config');
      }
      const config = await response.json();
      apiKey = config.apiKey;
      this.eventPrompt = config.eventPrompt;

      if (!this.eventPrompt) {
        console.warn('No active event prompt configured, using defaults');
      }
    } catch (e) {
      this.updateError('Failed to get config from backend. Make sure the backend is running on port 8000.');
      console.error('Config fetch error:', e);
      return;
    }

    this.client = new GoogleGenAI({
      apiKey: apiKey,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    // Use event prompt from backend, or fallback to default
    const systemInstruction = this.eventPrompt?.system_instruction || `You are the witty, observant, and welcoming AI Receptionist for "Nebula Talks".

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

Tone: Energetic, funny, professional but casual.`;

    const voiceName = this.eventPrompt?.voice || 'Orus';

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
            voiceConfig: {prebuiltVoiceConfig: {voiceName: voiceName as any}},
          },
          systemInstruction,
        },
      });
    } catch (e) {
      console.error(e);
      this.updateError(`Failed to connect: ${e.message}`);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startPersonDetection() {
    // Wait for both backend and camera to be ready
    while (!this.backendHealthy || !this.mediaStream) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

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

    console.log('Starting person detection...');

    // Wait for video to be ready
    this.videoElement.onloadedmetadata = async () => {
      await this.videoElement.play();
      console.log('Video ready, starting detection loop');
      // Start detection loop
      this.detectPersons();
    };
  }

  private connectToOrbPreview() {
    // Trigger update to reconnect stream via updated() lifecycle
    this.requestUpdate();
  }

  private async detectPersons() {
    if (!this.videoElement || !this.backendHealthy) {
      console.error('Detection cannot start - videoElement:', !!this.videoElement, 'backendHealthy:', this.backendHealthy);
      return;
    }

    console.log('Detection loop starting...');

    // Run detection every 500ms (but skip frames for efficiency)
    this.personDetectionInterval = window.setInterval(async () => {
      if (!this.detectionContext || !this.videoElement) return;

      try {
        // Skip frames to reduce backend load (process every 3rd frame)
        this.frameCounter++;
        if (this.frameCounter % (this.frameSkipCount + 1) !== 0) {
          return;
        }

        console.log(`Sending frame ${this.frameCounter} to backend...`);

        // Draw current frame to canvas
        this.detectionContext.drawImage(this.videoElement, 0, 0, 640, 480);

        // Convert to base64 JPEG (lower quality for faster transmission)
        const base64Image = this.detectionCanvas.toDataURL('image/jpeg', 0.7);

        // Send to backend
        const frameId = `frame-${this.frameCounter}`;
        const result = await detectPersonInFrame(base64Image, 0.6, frameId);

        console.log(`Detection: person=${result.person_found}, conf=${result.confidence.toFixed(2)}, time=${result.processing_time_ms.toFixed(0)}ms`);

        if (result.person_found) {
          this.noPersonCount = 0;
          this.personPresentCount++;

          // Person detected - immediately transition to orb
          if (!this.isRecording) {
            console.log('PERSON DETECTED! Starting recording...');
            this.personDetected = true;
            this.showOrb = true;
            this.hasGreeted = false;
            await this.startRecording();
          }
        } else {
          this.personPresentCount = 0;
          this.noPersonCount++;

          // No person - stop recording after 3 consecutive misses (debounce)
          if (this.isRecording && this.noPersonCount >= 3) {
            console.log('Person lost. Stopping recording...');
            this.personDetected = false;
            this.showOrb = false;
            this.hasGreeted = false;
            await this.stopRecording();
            this.reset();
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

          // Mark that user has spoken (for robot signal)
          fetch('http://localhost:8000/api/robot/mark-spoken', { method: 'POST' })
            .catch(err => console.error('Failed to mark user spoken:', err));
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
        <div class="nebula-subtitle">${this.eventPrompt?.name || 'Visual Intelligence Experience'}</div>

        <div class="detection-container">
          <div class="detection-ring ${this.detectionActive ? 'detecting' : ''}">
            <div class="detection-icon">${this.personDetected ? '✨' : '◉'}</div>
          </div>

          <div class="detection-text">
            ${this.personDetected
              ? 'Welcome! Your AI assistant is ready.'
              : this.eventPrompt?.description || 'Step into the frame to begin your experience'}
          </div>

          <div class="detection-status ${landingStatusClass}">
            <div class="status-dot"></div>
            <span>${landingStatusText}</span>
          </div>

          <video id="landingPreview" class="landing-preview" muted autoplay playsinline></video>
        </div>

        <div style="position: absolute; bottom: 30px; left: 0; right: 0; text-align: center;">
          <a href="/admin" style="color: rgba(255,255,255,0.3); text-decoration: none; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Admin Panel</a>
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
