"""
myCobot 320 Pi WebSocket Server - Fixed Version

Uses auto-detected port and baudrate that matches your working setup.
"""

import asyncio
import json
import logging
from websockets.server import serve
from pymycobot import MyCobot320
import serial.tools.list_ports
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Auto-detect port like your working script
def get_mycobot_port():
    """Auto-detect myCobot serial port"""
    ports = list(serial.tools.list_ports.comports())
    if ports:
        port = ports[0].device
        logger.info(f"Auto-detected port: {port}")
        return port
    else:
        # Fallback to default
        logger.warning("No ports detected, using /dev/ttyAMA0")
        return "/dev/ttyAMA0"


class MyCobotController:
    """Controller for myCobot 320 with predefined movements"""

    def __init__(self, port: str = None, baudrate: int = 115200):
        if port is None:
            port = get_mycobot_port()

        try:
            self.mc = MyCobot320(port, baudrate)
            self.mc.power_on()
            logger.info(f"myCobot 320 connected on {port} at {baudrate} baud")
        except Exception as e:
            logger.error(f"Failed to connect to myCobot: {e}")
            self.mc = None

    def is_connected(self) -> bool:
        return self.mc is not None

    def move_joint_smooth(self, joint_id, angles, speed):
        """Move joint smoothly through angles - like your working script"""
        if not self.mc:
            return

        for angle in angles:
            current = self.mc.get_angles()
            current[joint_id - 1] = angle  # Convert to 0-indexed
            self.mc.send_angles(current, speed)
            time.sleep(0.5)

    def go_home(self):
        """Return to home position"""
        if not self.mc:
            return
        logger.info("Going to home position")
        self.mc.send_angles([0, 0, 0, 0, 0, 0], 25)
        time.sleep(2)

    def wave_hand(self):
        """Wave hand gesture - using your working parameters"""
        if not self.mc:
            return

        logger.info("Wave hand")

        TRUNK_JOINT = 3
        WAVE_AMPLITUDE = 15
        WAVE_SPEED = 30
        WAVE_COUNT = 3

        self.go_home()

        for _ in range(WAVE_COUNT):
            self.move_joint_smooth(
                TRUNK_JOINT, [WAVE_AMPLITUDE, -WAVE_AMPLITUDE], WAVE_SPEED
            )
            time.sleep(0.2)

        self.go_home()

    def nod_head(self):
        """Nod head gesture - using your working parameters"""
        if not self.mc:
            return

        logger.info("Nod head")

        NOD_JOINT = 1
        NOD_AMPLITUDE = 10
        NOD_SPEED = 25
        NOD_COUNT = 3

        self.go_home()

        for _ in range(NOD_COUNT):
            self.move_joint_smooth(NOD_JOINT, [NOD_AMPLITUDE, NOD_AMPLITUDE], NOD_SPEED)
            time.sleep(0.2)

        self.go_home()

    def thumbs_up(self):
        """Thumbs up gesture"""
        if not self.mc:
            return

        logger.info("Thumbs up")

        # Thumbs up pose
        thumbs_pose = [0, -30, 60, -90, 90, 0]
        self.mc.send_angles(thumbs_pose, 50)
        time.sleep(1.5)

        self.go_home()

    def point_forward(self):
        """Point forward gesture"""
        if not self.mc:
            return

        logger.info("Point forward")

        # Pointing pose
        point_pose = [0, 20, 40, -90, 0, 0]
        self.mc.send_angles(point_pose, 50)
        time.sleep(1.5)

        self.go_home()

    def greet(self):
        """Greeting gesture - bow and wave"""
        if not self.mc:
            return

        logger.info("Greeting")

        # Bow
        self.mc.send_angles([0, 0, -30, 0, 0, 0], 40)
        time.sleep(0.8)

        # Return to upright
        self.mc.send_angles([0, 0, 0, 0, 0, 0], 40)
        time.sleep(0.5)

        # Wave
        self.wave_hand()

    def celebrate(self):
        """Celebration gesture"""
        if not self.mc:
            return

        logger.info("Celebrating!")

        celebrate_poses = [
            [0, -45, 90, -90, 90, 0],
            [0, -30, 100, -80, 100, 0],
            [0, -45, 90, -90, 90, 0],
            [0, -30, 100, -80, 100, 0],
        ]

        for pose in celebrate_poses:
            self.mc.send_angles(pose, 80)
            time.sleep(0.3)

        self.go_home()

    def execute_command(self, command: dict):
        """Execute a command from Nebula Talks"""
        if not self.mc:
            return {"status": "error", "message": "Robot not connected"}

        action = command.get("action", "")
        message = command.get("message", "")

        logger.info(f"Executing command: {action}")

        try:
            if action == "wave":
                self.wave_hand()
                return {"status": "success", "action": "wave", "message": "Waved hand!"}

            elif action == "thumbs_up":
                self.thumbs_up()
                return {
                    "status": "success",
                    "action": "thumbs_up",
                    "message": "Thumbs up!",
                }

            elif action == "point":
                self.point_forward()
                return {"status": "success", "action": "point", "message": "Pointing!"}

            elif action == "greet":
                self.greet()
                return {"status": "success", "action": "greet", "message": "Greeting!"}

            elif action == "celebrate":
                self.celebrate()
                return {
                    "status": "success",
                    "action": "celebrate",
                    "message": "Celebrating!",
                }

            elif action == "home":
                self.go_home()
                return {"status": "success", "action": "home", "message": "Going home"}

            elif action == "nod":
                self.nod_head()
                return {"status": "success", "action": "nod", "message": "Nodding!"}

            elif action == "move_to":
                # Custom coordinates
                coords = command.get("coordinates", [150, 0, 150])
                if len(coords) >= 6:
                    self.mc.send_coords(coords, 50)
                else:
                    self.mc.send_coords(coords + [0, 0, 0], 50)
                return {"status": "success", "action": "move_to", "coordinates": coords}

            elif action == "send_angles":
                # Send custom angles
                angles = command.get("angles", [0, 0, 0, 0, 0, 0])
                speed = command.get("speed", 50)
                if len(angles) == 6:
                    self.mc.send_angles(angles, speed)
                return {"status": "success", "action": "send_angles", "angles": angles}

            elif action == "send_angle":
                # Move single joint
                joint_id = command.get("joint_id", 1)
                angle = command.get("angle", 0)
                speed = command.get("speed", 50)
                if 1 <= joint_id <= 6:
                    self.mc.send_angle(joint_id, angle, speed)
                return {
                    "status": "success",
                    "action": "send_angle",
                    "joint": joint_id,
                    "angle": angle,
                }

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
        version = "Unknown"
        if controller.mc:
            try:
                version = controller.mc.get_system_version()
            except:
                pass

        await websocket.send(
            json.dumps(
                {
                    "type": "connected",
                    "message": "myCobot 320 ready for commands",
                    "robot": "myCobot 320 Pi",
                    "version": version,
                }
            )
        )

        # Receive and process commands
        async for message in websocket:
            try:
                data = json.loads(message)
                logger.info(f"Received: {data}")

                signal_type = data.get("signalType", "")
                signal_data = data.get("data", {})

                # Map signal types to robot actions
                action_mapping = {
                    "user_left_after_speaking": {"action": "wave"},
                    "wave_hand": {"action": "wave"},
                    "thumbs_up": {"action": "thumbs_up"},
                    "greet": {"action": "greet"},
                    "celebrate": {"action": "celebrate"},
                    "point": {"action": "point"},
                    "nod": {"action": "nod"},
                    "home": {"action": "home"},
                }

                command = action_mapping.get(signal_type, signal_data)

                if command:
                    # Execute command
                    result = controller.execute_command(command)

                    # Send response back
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "response",
                                "signalType": signal_type,
                                "result": result,
                                "timestamp": data.get("timestamp"),
                            }
                        )
                    )
                else:
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "error",
                                "message": f"Unknown signal type: {signal_type}",
                            }
                        )
                    )

            except json.JSONDecodeError:
                await websocket.send(
                    json.dumps({"type": "error", "message": "Invalid JSON"})
                )
            except Exception as e:
                await websocket.send(json.dumps({"type": "error", "message": str(e)}))

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        logger.info("Client disconnected")


async def main():
    """Main server"""
    global controller

    # Initialize myCobot controller with auto-detection
    controller = MyCobotController(baudrate=115200)

    # WebSocket server configuration
    HOST = "0.0.0.0"
    PORT = 8765

    logger.info(f"Starting myCobot WebSocket server on {HOST}:{PORT}")
    logger.info("Waiting for Nebula Talks connection...")

    async with serve(handle_websocket, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    controller = None
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        if controller and controller.mc:
            controller.mc.power_off()
