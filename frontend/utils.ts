/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Blob} from '@google/genai';

function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  // Extract interleaved channels
  if (numChannels === 0) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i,
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}

export {createBlob, decode, decodeAudioData, encode};

// ============================================================================
// Detection Backend API Client
// ============================================================================

const DETECTION_API_BASE_URL = 'http://localhost:8000';

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PersonDetectionResponse {
  person_found: boolean;
  confidence: number;
  bounding_box: BoundingBox | null;
  processing_time_ms: number;
  frame_id?: string;
}

interface PersonDetectionRequest {
  image_data: string;
  confidence_threshold: number;
  frame_id?: string;
}

/**
 * Send frame to backend for person detection
 */
export async function detectPersonInFrame(
  base64Image: string,
  confidenceThreshold: number = 0.6,
  frameId?: string
): Promise<PersonDetectionResponse> {
  const requestBody: PersonDetectionRequest = {
    image_data: base64Image,
    confidence_threshold: confidenceThreshold,
    frame_id: frameId
  };

  const response = await fetch(`${DETECTION_API_BASE_URL}/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Detection API error: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Check if detection backend is healthy
 */
export async function checkDetectionBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${DETECTION_API_BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}
