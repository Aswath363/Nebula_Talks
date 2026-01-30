"""
myCobot 320 WebSocket Integration for Nebula Talks

This module handles the WebSocket connection to the myCobot 320 Pi server.
Run mycobot_server.py on your myCobot Pi first, then the backend will connect.
"""
import asyncio
import json
import logging
from typing import Optional
import websockets
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MyCobotClient:
    """WebSocket client for myCobot 320 Pi"""

    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.uri = f"ws://{host}:{port}"
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self.reconnect_interval = 5  # seconds

    async def connect(self):
        """Connect to myCobot WebSocket server"""
        while True:
            try:
                logger.info(f"Connecting to myCobot at {self.uri}...")
                self.websocket = await websockets.connect(
                    self.uri,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=10
                )
                self.connected = True
                logger.info("✅ Connected to myCobot!")

                # Receive initial message
                welcome = await self.websocket.recv()
                logger.info(f"myCobot says: {welcome}")

                # Keep connection alive
                await self._keep_alive()

            except ConnectionRefusedError:
                logger.error(f"❌ Cannot connect to myCobot at {self.uri}")
                logger.info(f"Retrying in {self.reconnect_interval} seconds...")
                await asyncio.sleep(self.reconnect_interval)
            except Exception as e:
                logger.error(f"Connection error: {e}")
                self.connected = False
                await asyncio.sleep(self.reconnect_interval)

    async def _keep_alive(self):
        """Keep the connection alive and handle incoming messages"""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    self._handle_message(data)
                except json.JSONDecodeError:
                    logger.warning(f"Received non-JSON message: {message}")
        except websockets.exceptions.ConnectionClosed:
            logger.warning("myCobot connection closed")
            self.connected = False
        except Exception as e:
            logger.error(f"Error in keep_alive: {e}")
            self.connected = False

    def _handle_message(self, data: dict):
        """Handle incoming message from myCobot"""
        msg_type = data.get("type", "")

        if msg_type == "response":
            result = data.get("result", {})
            logger.info(f"🤖 myCobot response: {result}")

        elif msg_type == "connected":
            logger.info(f"✅ {data.get('message', 'Connected')}")

        elif msg_type == "error":
            logger.error(f"❌ myCobot error: {data.get('message')}")

    async def send_signal(self, signal_type: str, data: dict = None):
        """
        Send a signal to myCobot

        Args:
            signal_type: Type of signal (e.g., "wave_hand", "thumbs_up")
            data: Optional additional data
        """
        if not self.connected or not self.websocket:
            logger.warning("⚠️ Not connected to myCobot")
            return False

        try:
            message = {
                "signalType": signal_type,
                "timestamp": datetime.now().isoformat(),
                "data": data or {}
            }

            await self.websocket.send(json.dumps(message))
            logger.info(f"📤 Sent signal: {signal_type}")
            return True

        except Exception as e:
            logger.error(f"Failed to send signal: {e}")
            self.connected = False
            return False

    async def disconnect(self):
        """Disconnect from myCobot"""
        if self.websocket:
            await self.websocket.close()
            self.connected = False
            logger.info("Disconnected from myCobot")


# Global myCobot client instance
mycobot_client = MyCobotClient()


async def start_mycobot_connection():
    """Start the myCobot connection in background"""
    asyncio.create_task(mycobot_client.connect())


async def send_to_mycobot(signal_type: str, data: dict = None):
    """Send a signal to the myCobot"""
    return await mycobot_client.send_signal(signal_type, data)


# Available myCobot gestures
MYCOBOT_GESTURES = {
    "wave": "Wave hand gesture",
    "thumbs_up": "Thumbs up gesture",
    "point": "Point forward gesture",
    "greet": "Greeting gesture (bow + wave)",
    "celebrate": "Celebration gesture",
    "home": "Return to home position"
}
