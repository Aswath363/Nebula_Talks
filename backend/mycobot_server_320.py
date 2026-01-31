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
from threading import Thread, Event

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

        # Celebration mode
        self.celebrating = False
        self.celebrate_thread = None
        self.celebrate_stop_event = Event()
        # Celebration pose to use when person leaves
        self.EXIT_POSE = [-168.13, -52.99, 68.55, 93.16, -0.17, 0.26]
        self.EXIT_POSE_DURATION = 15  # seconds to hold pose when person leaves

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

    def start_celebrating(self):
        """Start continuous celebration mode when person is present"""
        if not self.mc:
            return

        if self.celebrating:
            logger.info("Already celebrating")
            return

        self.celebrating = True
        self.celebrate_stop_event.clear()

        logger.info("Starting continuous celebration mode")

        # Start celebration thread
        self.celebrate_thread = Thread(target=self._celebrate_cycle, daemon=True)
        self.celebrate_thread.start()

    def stop_celebrating_and_exit(self):
        """Stop celebration and go to exit pose when person leaves"""
        if not self.celebrating:
            logger.info("Not currently celebrating")
            return

        logger.info("Stopping celebration mode and moving to exit pose")
        self.celebrating = False
        self.celebrate_stop_event.set()

        # Wait for thread to finish
        if self.celebrate_thread and self.celebrate_thread.is_alive():
            self.celebrate_thread.join(timeout=2)

        # Move to exit pose and hold for 15 seconds
        logger.info(f"Moving to exit pose: {self.EXIT_POSE}")
        if self.mc:
            self.mc.send_angles(self.EXIT_POSE, 50)
            time.sleep(self.EXIT_POSE_DURATION)

        # Return to home
        logger.info("Returning to home position")
        self.go_home()

    def _celebrate_cycle(self):
        """Background thread that continuously celebrates while person is present"""
        try:
            while self.celebrating and not self.celebrate_stop_event.is_set():
                # Run the existing celebrate gesture
                self.celebrate()

                logger.info("Celebrating... waiting 5 seconds for next cycle")

                # Wait 5 seconds before next celebration
                if not self.celebrate_stop_event.wait(timeout=5):
                    # If stop event was triggered, break
                    logger.info("Stop event triggered")
                    break

            logger.info("Celebration cycle ended")

        except Exception as e:
            logger.error(f"Error in celebration cycle: {e}")
            self.celebrating = False

    def go_to_celebrate_pose(self):
        """Move to celebration pose once"""
        if not self.mc:
            return

        logger.info("Moving to celebration pose")
        self.mc.send_angles(self.CELEBRATE_POSE, 50)

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

            elif action == "start_celebrating":
                # Start continuous celebration when person enters
                self.start_celebrating()
                return {
                    "status": "success",
                    "action": "start_celebrating",
                    "message": "Started celebration mode!",
                }

            elif action == "stop_celebrating_and_exit":
                # Stop celebration and go to exit pose when person leaves
                self.stop_celebrating_and_exit()
                return {
                    "status": "success",
                    "action": "stop_celebrating_and_exit",
                    "message": "Stopped celebration and moved to exit pose",
                }

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
                    # Person presence signals for celebration mode
                    "start_celebrating": {"action": "start_celebrating"},
                    "stop_celebrating_and_exit": {
                        "action": "stop_celebrating_and_exit"
                    },
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
