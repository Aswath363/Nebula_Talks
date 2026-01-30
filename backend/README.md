# Nebula Talks Backend

Backend server for Nebula Talks with person detection and Gemini Live Audio API proxy.

## Features

- **Person Detection**: YOLO-based person detection using FastAPI
- **Gemini Live Audio Proxy**: Secure WebSocket proxy for Google Gemini Live Audio API
  - Keeps API keys secure on the backend
  - Handles real-time audio streaming
  - Handles video frame streaming for vision capabilities

## Setup

1. **Create a virtual environment**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

4. **Run the server**:
   ```bash
   python main.py
   ```

The server will start on `http://localhost:8000`

## API Endpoints

### REST API

- `GET /health` - Health check endpoint
- `POST /detect` - Detect persons in an image

### WebSocket

- `WS /ws/gemini` - WebSocket endpoint for Gemini Live Audio API

## WebSocket Protocol

### Client → Server Messages

Send JSON messages with the following structure:

**Audio input:**
```json
{
  "type": "audio",
  "data": "<base64_encoded_audio>"
}
```

**Video frame:**
```json
{
  "type": "video",
  "data": "<base64_encoded_image>"
}
```

**Text input:**
```json
{
  "type": "text",
  "text": "Your message here"
}
```

### Server → Client Messages

**Gemini response:**
```json
{
  "type": "gemini_response",
  "data": {
    "serverContent": {
      "modelTurn": {
        "parts": [
          {
            "inlineData": {
              "data": "<base64_audio>",
              "mime_type": "audio/linear16"
            }
          }
        ]
      },
      "interrupted": false,
      "turnComplete": true
    }
  }
}
```

**Setup complete:**
```json
{
  "type": "gemini_response",
  "data": {
    "setupComplete": true
  }
}
```
