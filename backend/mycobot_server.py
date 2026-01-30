"""
myCobot 320 Pi WebSocket Server

Run this on your myCobot 320 Pi to receive signals from Nebula Talks.

Install dependencies:
pip install websockets pymycobot

Usage:
python mycobot_server.py
"""
import asyncio
import json
import logging
from websockets.server import serve
from pymycobot import MyCobot
from time import sleep

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# myCobot 320 configuration
MC_PORT = "/dev/ttyAMA0"  # GPIO serial port on Pi
MC_BAUD = 1000000


class MyCobotController:
    """Controller for myCobot 320 with predefined movements"""

    def __init__(self, port: str = MC_PORT, baudrate: int = MC_BAUD):
        try:
            self.mc = MyCobot(port, baudrate)
            self.mc.power_on()
            logger.info("myCobot connected and powered on")
        except Exception as e:
            logger.error(f"Failed to connect to myCobot: {e}")
            self.mc = None

    def is_connected(self) -> bool:
        return self.mc is not None

    def wave_hand(self, speed: str = "normal"):
        """Wave hand gesture"""
        if not self.mc:
            return

        logger.info(f"Wave hand (speed: {speed})")

        # Get current angles
        current_angles = self.mc.get_angles()

        # Wave sequence - side to side movement
        wave_positions = [
            [0, 0, 0, 0, 90, 0],      # Start position
            [0, 0, 0, 0, 45, 0],      # Wrist left
            [0, 0, 0, 0, 135, 0],     # Wrist right
            [0, 0, 0, 0, 45, 0],      # Wrist left
            [0, 0, 0, 0, 135, 0],     # Wrist right
            [0, 0, 0, 0, 90, 0],      # Back to center
        ]

        speed_val = 80 if speed == "fast" else 50

        for angles in wave_positions:
            self.mc.send_angles(angles, speed_val)
            sleep(0.3)

        # Return to home
        self.go_home()

    def thumbs_up(self, speed: str = "normal"):
        """Thumbs up gesture"""
        if not self.mc:
            return

        logger.info(f"Thumbs up (speed: {speed})")

        # Thumbs up pose
        thumbs_pose = [0, -30, 60, -90, 90, 0]
        speed_val = 80 if speed == "fast" else 50

        self.mc.send_angles(thumbs_pose, speed_val)
        sleep(1.5)

        self.go_home()

    def point_forward(self):
        """Point forward gesture"""
        if not self.mc:
            return

        logger.info("Point forward")

        # Pointing pose
        point_pose = [0, 20, 40, -90, 0, 0]
        self.mc.send_angles(point_pose, 50)
        sleep(1.5)

        self.go_home()

    def greet(self):
        """Greeting gesture - bow and wave"""
        if not self.mc:
            return

        logger.info("Greeting")

        # Bow
        self.mc.send_angles([0, 0, -30, 0, 0, 0], 40)
        sleep(0.8)

        # Return to upright
        self.mc.send_angles([0, 0, 0, 0, 0, 0], 40)
        sleep(0.5)

        # Wave
        self.wave_hand("normal")

    def go_home(self):
        """Return to home position"""
        if not self.mc:
            return

        logger.info("Going to home position")
        self.mc.send_angles([0, 0, 0, 0, 0, 0], 60)
        sleep(0.5)

    def celebrate(self):
        """Celebration gesture - arms up and wiggle"""
        if not self.mc:
            return

        logger.info("Celebration!")

        celebrate_poses = [
            [0, -45, 90, -90, 90, 0],
            [0, -30, 100, -80, 100, 0],
            [0, -45, 90, -90, 90, 0],
            [0, -30, 100, -80, 100, 0],
        ]

        for pose in celebrate_poses:
            self.mc.send_angles(pose, 80)
            sleep(0.3)

        self.go_home()

    def execute_command(self, command: dict):
        """Execute a command from Nebula Talks"""
        if not self.mc:
            return {"status": "error", "message": "Robot not connected"}

        action = command.get("action", "")
        speed = command.get("speed", "normal")
        message = command.get("message", "")

        logger.info(f"Executing command: {action}")

        try:
            if action == "wave":
                self.wave_hand(speed)
                return {"status": "success", "action": "wave", "message": "Waved hand!"}

            elif action == "thumbs_up":
                self.thumbs_up(speed)
                return {"status": "success", "action": "thumbs_up", "message": "Thumbs up!"}

            elif action == "point":
                self.point_forward()
                return {"status": "success", "action": "point", "message": "Pointing!"}

            elif action == "greet":
                self.greet()
                return {"status": "success", "action": "greet", "message": "Greeting!"}

            elif action == "celebrate":
                self.celebrate()
                return {"status": "success", "action": "celebrate", "message": "Celebrating!"}

            elif action == "home":
                self.go_home()
                return {"status": "success", "action": "home", "message": "Going home"}

            elif action == "move_to":
                # Custom coordinates
                coords = command.get("coordinates", [150, 0, 150])
                self.mc.send_coords(coords, 50)
                return {"status": "success", "action": "move_to", "coordinates": coords}

            else:
                return {"status": "error", "message": f"Unknown action: {action}"}

        except Exception as e:
            logger.error(f"Error executing command: {e}")
            return {"status": "error", "message": str(e)}


async def handle_websocket(websocket, path):
    """Handle WebSocket connection from Nebula Talks"""
    logger.info("Client connected")

    try:
        # Send welcome message
        await websocket.send(json.dumps({
            "type": "connected",
            "message": "myCobot 320 ready for commands",
            "robot": "myCobot 320 Pi"
        }))

        # Receive and process commands
        async for message in websocket:
            try:
                data = json.loads(message)
                logger.info(f"Received: {data}")

                signal_type = data.get("signalType", "")
                signal_data = data.get("data", {})

                # Map signal types to robot actions
                action_mapping = {
                    "user_left_after_speaking": {"action": "wave", "speed": "normal"},
                    "wave_hand": {"action": "wave", "speed": "normal"},
                    "thumbs_up": {"action": "thumbs_up", "speed": "normal"},
                    "greet": {"action": "greet"},
                    "celebrate": {"action": "celebrate"},
                    "point": {"action": "point"},
                }

                command = action_mapping.get(signal_type, signal_data)

                if command:
                    # Execute the command
                    result = controller.execute_command(command)

                    # Send response back
                    await websocket.send(json.dumps({
                        "type": "response",
                        "signalType": signal_type,
                        "result": result,
                        "timestamp": data.get("timestamp")
                    }))
                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"Unknown signal type: {signal_type}"
                    }))

            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON"
                }))
            except Exception as e:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": str(e)
                }))

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        logger.info("Client disconnected")


async def main():
    """Main server"""
    global controller

    # Initialize myCobot controller
    controller = MyCobotController()

    # WebSocket server configuration
    HOST = "0.0.0.0"  # Listen on all interfaces
    PORT = 8765

    logger.info(f"Starting myCobot WebSocket server on {HOST}:{PORT}")
    logger.info("Waiting for Nebula Talks connection...")

    async with serve(handle_websocket, HOST, PORT):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    controller = None
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        if controller and controller.mc:
            controller.mc.power_off()
