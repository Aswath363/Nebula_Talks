"""
WebSocket proxy for Google Gemini Live Audio API.
Keeps API keys secure on the backend.

Note: Uses the Google GenAI SDK's live session API which requires:
- pip install google-generativeai
"""
import os
import json
import base64
import asyncio
import logging
from typing import Any, AsyncGenerator
from fastapi import WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini API
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set")
genai.configure(api_key=API_KEY)

# Model to use for live sessions
MODEL = "models/gemini-2.5-flash-exp"

# System instruction for the AI Receptionist
SYSTEM_INSTRUCTION = """You are the witty, observant, and welcoming AI Receptionist for "Nebula Talks".

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

IMPORTANT: When the session starts (you hear audio begin), IMMEDIATELY start with your greeting. Don't wait for the user to speak first - YOU initiate the conversation!"""

# Function declaration for hand gestures
MOVE_HAND_FUNCTION = {
    "name": "move_hand",
    "description": "Move the hand to a target position. Use gestures to enhance communication.",
    "parameters": {
        "type": "object",
        "properties": {
            "position": {
                "type": "string",
                "enum": ["WAVE", "THUMBS_UP", "POINT", "OPEN_HAND", "FIST", "PEACE_SIGN", "OK_SIGN"],
                "description": "The hand gesture to perform"
            },
            "speed": {
                "type": "string",
                "enum": ["SLOW", "NORMAL", "FAST"],
                "description": "The speed of the gesture"
            }
        },
        "required": ["position"]
    }
}


class GeminiProxy:
    """WebSocket proxy for Gemini Live Audio API sessions."""

    def __init__(self, websocket: WebSocket):
        self.client_ws = websocket
        self.session = None
        self.task = None
        self.response_queue = asyncio.Queue()

    async def handle_client(self):
        """Handle incoming WebSocket messages from the frontend."""
        try:
            await self.client_ws.accept()
            logger.info("Client connected")

            # Initialize Gemini session
            await self.init_gemini_session()

            # Start response forwarding task
            self.task = asyncio.create_task(self.forward_responses())

            # Message loop
            while True:
                message = await self.client_ws.receive()

                if "text" in message:
                    data = json.loads(message["text"])
                    await self.handle_message(data)

                elif "bytes" in message:
                    # Handle binary audio data
                    await self.handle_binary_audio(message["bytes"])

        except WebSocketDisconnect:
            logger.info("Client disconnected")
        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            await self.client_ws.close(code=1011, reason=str(e))
        finally:
            self.close()

    async def init_gemini_session(self):
        """Initialize the Gemini Live Audio session."""
        try:
            # Create a GenerativeModel with live capabilities
            self.session = genai.live.AsyncLiveSession(
                model=MODEL,
                config={
                    "generation_config": {
                        "response_modalities": ["AUDIO"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": "Orus"
                                }
                            }
                        }
                    },
                    "system_instruction": {
                        "parts": [{"text": SYSTEM_INSTRUCTION}]
                    },
                    "tools": [{"function_declarations": [MOVE_HAND_FUNCTION]}]
                }
            )

            # Start the session
            await self.session.start()

            logger.info("Gemini session initialized")

            # Notify client that session is ready
            await self.client_ws.send_json({
                "type": "gemini_response",
                "data": {"setupComplete": True}
            })

        except Exception as e:
            logger.error(f"Failed to initialize Gemini session: {e}", exc_info=True)
            raise

    async def forward_responses(self):
        """Forward Gemini responses to the client."""
        try:
            async for response in self.session.receive():
                serialized = self._serialize_response(response)
                await self.client_ws.send_json({
                    "type": "gemini_response",
                    "data": serialized
                })
        except Exception as e:
            logger.error(f"Error in response forwarding: {e}", exc_info=True)

    def _serialize_response(self, response: Any) -> dict:
        """Serialize Gemini response to dict."""
        result = {}

        # Handle ServerContent
        if hasattr(response, 'server_content'):
            sc = response.server_content
            result["serverContent"] = {}

            if hasattr(sc, 'model_turn'):
                result["serverContent"]["modelTurn"] = {}
                if sc.model_turn.parts:
                    parts = []
                    for part in sc.model_turn.parts:
                        part_dict = {}
                        if hasattr(part, 'inline_data') and part.inline_data:
                            part_dict["inlineData"] = {
                                "data": part.inline_data.data,
                                "mime_type": part.inline_data.mime_type
                            }
                        if hasattr(part, 'function_call') and part.function_call:
                            part_dict["functionCall"] = {
                                "name": part.function_call.name,
                                "args": dict(part.function_call.args)
                            }
                        if hasattr(part, 'text') and part.text:
                            part_dict["text"] = part.text
                        if part_dict:
                            parts.append(part_dict)
                    if parts:
                        result["serverContent"]["modelTurn"]["parts"] = parts

            if hasattr(sc, 'interrupted'):
                result["serverContent"]["interrupted"] = sc.interrupted

            if hasattr(sc, 'turn_complete'):
                result["serverContent"]["turnComplete"] = sc.turn_complete

        # Handle setup complete
        if hasattr(response, 'setup_complete'):
            result["setupComplete"] = response.setup_complete

        # Handle tool calls
        if hasattr(response, 'tool_call') and response.tool_call:
            tc = response.tool_call
            result["toolCall"] = {
                "functionCalls": []
            }
            if hasattr(tc, 'function_calls'):
                for fc in tc.function_calls:
                    result["toolCall"]["functionCalls"].append({
                        "name": fc.name,
                        "args": dict(fc.args) if hasattr(fc, 'args') else {}
                    })

        return result if result else {"raw": str(response)}

    async def handle_message(self, data: dict):
        """Handle JSON message from client."""
        if not self.session:
            logger.warning("Session not initialized")
            return

        msg_type = data.get("type")

        try:
            if msg_type == "audio":
                # Realtime audio input (base64 encoded)
                audio_data = base64.b64decode(data.get("data", ""))
                await self.session.send(audio_data)

            elif msg_type == "video":
                # Video frame (base64 encoded)
                image_data = base64.b64decode(data.get("data", ""))
                await self.session.send({
                    "mime_type": "image/jpeg",
                    "data": image_data
                })

            elif msg_type == "text":
                # Text input
                await self.session.send({
                    "text": data.get("text", "")
                })

            elif msg_type == "config":
                # Update session config
                await self.session.send({
                    "config": data.get("config", {})
                })

            else:
                logger.warning(f"Unknown message type: {msg_type}")

        except Exception as e:
            logger.error(f"Error handling message: {e}", exc_info=True)

    async def handle_binary_audio(self, data: bytes):
        """Handle binary audio data directly."""
        if self.session:
            try:
                await self.session.send(data)
            except Exception as e:
                logger.error(f"Error sending binary audio: {e}", exc_info=True)

    def close(self):
        """Close the Gemini session and cleanup."""
        if self.task and not self.task.done():
            self.task.cancel()

        if self.session:
            try:
                # Close the session synchronously
                asyncio.create_task(self._close_session())
            except Exception as e:
                logger.error(f"Error closing session: {e}")

        logger.info("Gemini proxy closed")

    async def _close_session(self):
        """Async helper to close the session."""
        if self.session:
            await self.session.close()
