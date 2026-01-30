"""
Robot Signal Service - Send commands to robots when users leave after speaking
Supports multiple communication protocols: HTTP, WebSocket, MQTT, Serial
"""
import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import httpx
import serial
import serial.tools.list_ports
from paho.mqtt.client import Client as MQTTClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RobotProtocol(Enum):
    """Supported robot communication protocols"""
    HTTP = "http"
    WEBSOCKET = "websocket"
    MQTT = "mqtt"
    SERIAL = "serial"


@dataclass
class RobotConfig:
    """Configuration for a robot"""
    id: str
    name: str
    protocol: RobotProtocol
    enabled: bool = True

    # HTTP/WebSocket config
    url: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)

    # MQTT config
    mqtt_broker: Optional[str] = None
    mqtt_port: int = 1883
    mqtt_topic: Optional[str] = None
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = None

    # Serial config
    serial_port: Optional[str] = None
    serial_baudrate: int = 9600

    # Custom commands
    commands: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RobotSignal:
    """A signal to send to a robot"""
    signal_type: str  # e.g., "user_left", "user_spoke", "wave_hand"
    timestamp: datetime = field(default_factory=datetime.now)
    data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "signalType": self.signal_type,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data
        }


class RobotSignalService:
    """Service for sending signals to robots"""

    def __init__(self):
        self.robots: Dict[str, RobotConfig] = {}
        self.http_client = httpx.AsyncClient(timeout=5.0)
        self.websocket_connections: Dict[str, Any] = {}
        self.mqtt_client: Optional[MQTTClient] = None
        self.serial_connections: Dict[str, serial.Serial] = {}

    async def load_robots(self, robots_file: str = "robots.json"):
        """Load robot configurations from file"""
        try:
            with open(robots_file, 'r') as f:
                data = json.load(f)

            for robot_data in data.get('robots', []):
                robot = RobotConfig(
                    id=robot_data['id'],
                    name=robot_data['name'],
                    protocol=RobotProtocol(robot_data['protocol']),
                    enabled=robot_data.get('enabled', True),
                    url=robot_data.get('url'),
                    headers=robot_data.get('headers', {}),
                    mqtt_broker=robot_data.get('mqtt_broker'),
                    mqtt_port=robot_data.get('mqtt_port', 1883),
                    mqtt_topic=robot_data.get('mqtt_topic'),
                    mqtt_username=robot_data.get('mqtt_username'),
                    mqtt_password=robot_data.get('mqtt_password'),
                    serial_port=robot_data.get('serial_port'),
                    serial_baudrate=robot_data.get('serial_baudrate', 9600),
                    commands=robot_data.get('commands', {})
                )
                self.robots[robot.id] = robot

            logger.info(f"Loaded {len(self.robots)} robot configurations")
        except FileNotFoundError:
            logger.warning(f"No robots configuration file found at {robots_file}")
        except Exception as e:
            logger.error(f"Error loading robots: {e}")

    def save_robots(self, robots_file: str = "robots.json"):
        """Save robot configurations to file"""
        data = {
            "robots": [
                {
                    "id": r.id,
                    "name": r.name,
                    "protocol": r.protocol.value,
                    "enabled": r.enabled,
                    "url": r.url,
                    "headers": r.headers,
                    "mqtt_broker": r.mqtt_broker,
                    "mqtt_port": r.mqtt_port,
                    "mqtt_topic": r.mqtt_topic,
                    "mqtt_username": r.mqtt_username,
                    "mqtt_password": r.mqtt_password,
                    "serial_port": r.serial_port,
                    "serial_baudrate": r.serial_baudrate,
                    "commands": r.commands
                }
                for r in self.robots.values()
            ]
        }
        with open(robots_file, 'w') as f:
            json.dump(data, f, indent=2)

    def add_robot(self, robot: RobotConfig):
        """Add a robot configuration"""
        self.robots[robot.id] = robot
        self.save_robots()
        logger.info(f"Added robot: {robot.name}")

    def remove_robot(self, robot_id: str):
        """Remove a robot configuration"""
        if robot_id in self.robots:
            # Close any open connections
            asyncio.create_task(self._disconnect_robot(robot_id))
            del self.robots[robot_id]
            self.save_robots()
            logger.info(f"Removed robot: {robot_id}")

    async def send_signal(self, signal: RobotSignal, robot_id: Optional[str] = None):
        """
        Send a signal to robot(s)

        Args:
            signal: The signal to send
            robot_id: Specific robot to send to, or None for all enabled robots
        """
        target_robots = [self.robots[robot_id]] if robot_id else [
            r for r in self.robots.values() if r.enabled
        ]

        if not target_robots:
            logger.warning("No target robots found")
            return

        logger.info(f"Sending signal '{signal.signal_type}' to {len(target_robots)} robot(s)")

        tasks = []
        for robot in target_robots:
            tasks.append(self._send_to_robot(robot, signal))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        success_count = sum(1 for r in results if r is True or isinstance(r, bool) and r)
        logger.info(f"Signal sent successfully to {success_count}/{len(target_robots)} robots")

    async def _send_to_robot(self, robot: RobotConfig, signal: RobotSignal) -> bool:
        """Send signal to a specific robot based on its protocol"""
        try:
            # Check for custom command mapping
            custom_command = robot.commands.get(signal.signal_type)
            if custom_command:
                signal_data = {**signal.to_dict(), **custom_command}
            else:
                signal_data = signal.to_dict()

            if robot.protocol == RobotProtocol.HTTP:
                return await self._send_http(robot, signal_data)
            elif robot.protocol == RobotProtocol.WEBSOCKET:
                return await self._send_websocket(robot, signal_data)
            elif robot.protocol == RobotProtocol.MQTT:
                return await self._send_mqtt(robot, signal_data)
            elif robot.protocol == RobotProtocol.SERIAL:
                return await self._send_serial(robot, signal_data)
            else:
                logger.warning(f"Unknown protocol: {robot.protocol}")
                return False

        except Exception as e:
            logger.error(f"Error sending to robot {robot.name}: {e}")
            return False

    async def _send_http(self, robot: RobotConfig, signal_data: dict) -> bool:
        """Send signal via HTTP POST"""
        if not robot.url:
            logger.error(f"HTTP robot {robot.name} has no URL configured")
            return False

        try:
            response = await self.http_client.post(
                robot.url,
                json=signal_data,
                headers=robot.headers
            )
            response.raise_for_status()
            logger.info(f"HTTP signal sent to {robot.name}: {response.status_code}")
            return True
        except Exception as e:
            logger.error(f"HTTP error for {robot.name}: {e}")
            return False

    async def _send_websocket(self, robot: RobotConfig, signal_data: dict) -> bool:
        """Send signal via WebSocket"""
        if not robot.url:
            logger.error(f"WebSocket robot {robot.name} has no URL configured")
            return False

        try:
            import websockets

            if robot.id not in self.websocket_connections:
                # Connect
                ws = await websockets.connect(robot.url)
                self.websocket_connections[robot.id] = ws
                logger.info(f"WebSocket connected to {robot.name}")

            ws = self.websocket_connections[robot.id]
            await ws.send(json.dumps(signal_data))
            logger.info(f"WebSocket signal sent to {robot.name}")
            return True

        except Exception as e:
            logger.error(f"WebSocket error for {robot.name}: {e}")
            # Remove broken connection
            if robot.id in self.websocket_connections:
                del self.websocket_connections[robot.id]
            return False

    async def _send_mqtt(self, robot: RobotConfig, signal_data: dict) -> bool:
        """Send signal via MQTT"""
        if not robot.mqtt_broker or not robot.mqtt_topic:
            logger.error(f"MQTT robot {robot.name} missing broker or topic")
            return False

        try:
            if self.mqtt_client is None:
                self.mqtt_client = MQTTClient(client_id="nebula-talks")
                if robot.mqtt_username and robot.mqtt_password:
                    self.mqtt_client.username_pw_set(robot.mqtt_username, robot.mqtt_password)
                self.mqtt_client.connect(robot.mqtt_broker, robot.mqtt_port)
                self.mqtt_client.loop_start()
                logger.info("MQTT client connected")

            self.mqtt_client.publish(robot.mqtt_topic, json.dumps(signal_data))
            logger.info(f"MQTT signal sent to {robot.name} topic: {robot.mqtt_topic}")
            return True

        except Exception as e:
            logger.error(f"MQTT error for {robot.name}: {e}")
            return False

    async def _send_serial(self, robot: RobotConfig, signal_data: dict) -> bool:
        """Send signal via Serial/UART"""
        if not robot.serial_port:
            logger.error(f"Serial robot {robot.name} has no port configured")
            return False

        try:
            if robot.id not in self.serial_connections:
                # Connect to serial port
                ser = serial.Serial(
                    port=robot.serial_port,
                    baudrate=robot.serial_baudrate,
                    timeout=1
                )
                self.serial_connections[robot.id] = ser
                logger.info(f"Serial connected to {robot.name} on {robot.serial_port}")

            ser = self.serial_connections[robot.id]

            # Convert signal to serial format (JSON string + newline)
            message = json.dumps(signal_data) + "\n"
            ser.write(message.encode())
            ser.flush()
            logger.info(f"Serial signal sent to {robot.name}")
            return True

        except Exception as e:
            logger.error(f"Serial error for {robot.name}: {e}")
            if robot.id in self.serial_connections:
                del self.serial_connections[robot.id]
            return False

    async def _disconnect_robot(self, robot_id: str):
        """Close connections for a robot"""
        robot = self.robots.get(robot_id)
        if not robot:
            return

        if robot.id in self.websocket_connections:
            try:
                await self.websocket_connections[robot.id].close()
            except:
                pass
            del self.websocket_connections[robot.id]

        if robot.id in self.serial_connections:
            try:
                self.serial_connections[robot.id].close()
            except:
                pass
            del self.serial_connections[robot.id]

    async def cleanup(self):
        """Cleanup all connections"""
        for robot_id in list(self.robots.keys()):
            await self._disconnect_robot(robot_id)

        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()

        await self.http_client.aclose()

    @staticmethod
    def list_serial_ports() -> List[Dict[str, str]]:
        """List available serial ports"""
        ports = []
        for port in serial.tools.list_ports.comports():
            ports.append({
                "device": port.device,
                "description": port.description,
                "hwid": port.hwid
            })
        return ports


# Global robot signal service instance
robot_service = RobotSignalService()
