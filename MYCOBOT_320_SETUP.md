# myCobot 320 Pi - Complete Setup Guide for Nebula Talks

This guide provides complete setup instructions for connecting Nebula Talks to your myCobot 320 Pi robot arm using the official `pymycobot` library.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Part 1: Setup on myCobot Pi](#part-1-setup-on-mycobot-pi)
- [Part 2: Configure Backend](#part-2-configure-backend)
- [Part 3: Test Connection](#part-3-test-connection)
- [Available Gestures](#available-gestures)
- [Using the Robot](#using-the-robot)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Advanced Features](#advanced-features)

---

## Prerequisites

### Hardware Requirements

- myCobot 320 Pi robot arm
- Power supply for myCobot
- Network connection (Ethernet or WiFi)
- Computer to run Nebula Talks backend

### Software Requirements

- Python 3.8+ on myCobot Pi
- SSH access to myCobot Pi

---

## Part 1: Setup on myCobot Pi

### Step 1: SSH into your myCobot Pi

```bash
ssh pi@<mycobot-ip-address>
# Default password is usually 'pi' or '123456'
```

### Step 2: Install pymycobot library

The myCobot 320 uses the official `pymycobot` library from ElephantRobotics.

```bash
pip3 install pymycobot
```

**Note:** Make sure the firmware is up to date. The Atom firmware should be flashed, and Transponder firmware should be flashed into the base Basic.

### Step 3: Install WebSocket dependencies

```bash
pip3 install websockets
```

### Step 4: Verify pymycobot installation

```bash
python3 -c "from pymycobot import MyCobot320; print('pymycobot installed successfully')"
```

You should see: `pymycobot installed successfully`

### Step 5: Copy server script

Copy the updated server script `mycobot_server_320.py` to your myCobot Pi:

```bash
# From your main machine
scp backend/mycobot_server_320.py pi@<mycobot-ip>:~/
```

Or create it directly on the Pi using `nano`:

```bash
nano mycobot_server_320.py
# Paste the content, then Ctrl+O, Enter, Ctrl+X
```

### Step 6: Run the myCobot server

```bash
python3 mycobot_server_320.py
```

You should see:
```
INFO - Starting myCobot WebSocket server on 0.0.0.0:8765
INFO - Waiting for Nebula Talks connection...
INFO - myCobot 320 connected and powered on
```

### Step 7: Note your myCobot IP address

```bash
hostname -I
# Example output: 192.168.1.100
```

---

## Part 2: Configure Backend

### Step 1: Update backend dependencies

Edit `backend/requirements.txt` to ensure pymycobot is listed:

```txt
fastapi==0.115.0
uvicorn[standard]==0.32.0
ultralytics==8.3.0
python-multipart==0.0.20
pillow==11.0.0
pydantic==2.10.0
websockets==14.1
python-dotenv==1.0.0
google-generativeai==0.8.0
httpx==0.27.0
paho-mqtt==1.6.1
pyserial==3.5
pymycobot  # Added for myCobot 320
```

### Step 2: Install backend dependencies

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### Step 3: Configure myCobot connection

Edit `backend/.env`:

```bash
# myCobot 320 Pi Configuration
MYCOBOT_HOST=192.168.1.100  # Your myCobot's IP
MYCOBOT_PORT=8765
```

### Step 4: Restart backend

```bash
# Stop current backend (Ctrl+C)
python main.py
```

You should see:
```
Connecting to myCobot at 192.168.1.100:8765...
✅ Connected to myCobot!
```

---

## Part 3: Test Connection

### Check connection status

```bash
curl http://localhost:8000/api/mycobot/status
```

Expected response:
```json
{
  "connected": true,
  "host": "192.168.1.100",
  "port": 8765
}
```

### Test basic gesture

```bash
curl -X POST http://localhost:8000/api/mycobot/gesture/wave
```

Your myCobot should wave! 👋

---

## Available Gestures

### Built-in Gestures

| Gesture | API Endpoint | Description |
|---------|-------------|-------------|
| **wave** | `/api/mycobot/gesture/wave` | Wave hand gesture |
| **thumbs_up** | `/api/mycobot/gesture/thumbs_up` | Thumbs up |
| **point** | `/api/mycobot/gesture/point` | Point forward |
| **greet** | `/api/mycobot/gesture/greet` | Greeting (bow + wave) |
| **celebrate** | `/api/mycobot/gesture/celebrate` | Celebration |
| **home** | `/api/mycobot/gesture/home` | Return to home position |

### Custom Commands

You can also send custom commands:

#### Move to Coordinates

```bash
curl -X POST http://localhost:8000/api/mycobot/custom \
  -H "Content-Type: application/json" \
  -d '{
    "action": "move_to",
    "coordinates": [150, 0, 150]
  }'
```

#### Send Angles

```bash
curl -X POST http://localhost:8000/api/mycobot/custom \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_angles",
    "angles": [0, 30, 45, -60, 45, 0],
    "speed": 50
  }'
```

#### Move Single Joint

```bash
curl -X POST http://localhost:8000/api/mycobot/custom \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_angle",
    "joint_id": 1,
    "angle": 45,
    "speed": 50
  }'
```

---

## Using the Robot

### Option 1: Robot Dashboard (Web UI)

1. Visit: `http://localhost:8000/robot-dashboard.html`
2. Click gesture buttons to control robot manually
3. Test signals and view activity logs

### Option 2: Automatic (During Demo)

When a visitor interacts with Nebula Talks:

1. **User enters frame** → AI starts conversation automatically
2. **User holds SPACE** → Speaks with AI (push-to-talk)
3. **User releases SPACE** → Marked as "has spoken"
4. **User leaves frame** → **myCobot waves automatically!**

The robot will wave goodbye to visitors who have spoken with the AI.

### Option 3: API Control

Control the robot programmatically via HTTP API:

```python
import requests

# Wave gesture
response = requests.post(
    "http://localhost:8000/api/mycobot/gesture/wave"
)
print(response.json())

# Get current angles
response = requests.get("http://localhost:8000/api/mycobot/status")
print(response.json())
```

---

## API Reference

### myCobot 320 Key Methods

The `mycobot_server_320.py` uses the official `pymycobot.MyCobot320` class.

#### Initialization

```python
from pymycobot import MyCobot320

mc = MyCobot320("/dev/ttyAMA0", 1000000)
mc.power_on()
```

#### Basic Movement

```python
# Get current angles
angles = mc.get_angles()  # Returns list of 6 angles
print(angles)

# Move single joint
mc.send_angle(1, 40, 20)  # Joint 1, 40 degrees, speed 20

# Move all joints
mc.send_angles([0, 30, 45, -60, 45, 0], 50)  # All joints, speed 50

# Get current coordinates
coords = mc.get_coords()  # Returns [x, y, z, rx, ry, rz]
print(coords)

# Move to coordinates
mc.send_coords([150, 0, 150, 0, 0, 0], 50, 0)  # coords, speed, mode
```

#### Gripper Control

```python
# Open gripper
mc.set_gripper_state(0, 50)  # 0=open, 1=close, speed 1-100

# Close gripper
mc.set_gripper_state(1, 50)

# Set gripper value (0-100)
mc.set_gripper_value(100, 50)  # 100=fully closed
```

#### LED Control

```python
# Set end effector LED color
mc.set_color(255, 0, 0)  # RGB values 0-255
```

#### Power Control

```python
# Power on
mc.power_on()

# Power off
mc.power_off()

# Check if powered on
status = mc.is_power_on()  # Returns 1 or 0
```

#### Joint Limits

```python
# Get min/max angles for a joint
min_angle = mc.get_joint_min_angle(1)  # Joint 1 minimum
max_angle = mc.get_joint_max_angle(1)  # Joint 1 maximum
```

### Full API Documentation

For complete API reference, see:
- [MyCobot 320 API Documentation](https://github.com/elephantrobotics/pymycobot/blob/main/docs/MyCobot_320_en.md)
- [pymycobot GitHub Repository](https://github.com/elephantrobotics/pymycobot)

---

## Troubleshooting

### myCobot Pi Issues

#### pymycobot not installed

```bash
# Check installation
pip3 list | grep pymycobot

# If not found, reinstall
pip3 install --upgrade pymycobot
```

#### Connection refused

```bash
# Check if server is running on Pi
ssh pi@<mycobot-ip> "ps aux | grep mycobot_server"

# Check if port 8765 is open
nc -zv <mycobot-ip> 8765
```

#### Robot not moving

```bash
# Check if myCobot is powered on
ssh pi@<mycobot-ip> "python3 -c 'from pymycobot import MyCobot320; mc = MyCobot320(\"/dev/ttyAMA0\", 1000000); mc.power_on(); print(\"Power status:\", mc.is_power_on())'"

# Check serial connection
ls /dev/ttyAMA0
```

#### Serial port not found

```bash
# List available serial ports
ls /dev/tty*

# On myCobot 320 Pi, it should be /dev/ttyAMA0
# If different, update MC_PORT in mycobot_server_320.py
```

### Backend Issues

#### Can't connect to myCobot

```bash
# Ping myCobot from backend machine
ping <mycobot-ip>

# Check backend logs
# Look for "Connecting to myCobot at..."
```

#### Import error for pymycobot

```bash
cd backend
source venv/bin/activate
pip install pymycobot
```

### Network Issues

#### Firewall blocking connection

```bash
# Allow port 8765 on myCobot Pi
sudo ufw allow 8765
```

#### Wrong IP address

```bash
# Find correct IP
ssh pi@<mycobot-ip> "hostname -I"

# Check if IP is reachable from backend machine
ping <mycobot-ip>
```

---

## Advanced Features

### Custom Gestures

Edit `mycobot_server_320.py` to add new gestures:

```python
def dance(self):
    """Custom dance gesture"""
    if not self.mc:
        return

    logger.info("Dancing!")

    # Define dance sequence
    dance_poses = [
        [0, -30, 45, -45, 90, 0],
        [0, 30, 45, -45, 90, 0],
        [0, -30, 45, -45, 90, 0],
        [0, 30, 45, -45, 90, 0],
    ]

    for pose in dance_poses:
        self.mc.send_angles(pose, 80)
        sleep(0.3)

    self.go_home()
```

Add to `execute_command` method:

```python
elif action == "dance":
    self.dance()
    return {"status": "success", "action": "dance", "message": "Dancing!"}
```

### Synchronous Movement

Wait for movement to complete before continuing:

```python
# Move to angles and wait for completion
mc.sync_send_angles([0, 30, 45, -60, 45, 0], 50, timeout=15)

# Move to coordinates and wait for completion
mc.sync_send_coords([150, 0, 150, 0, 0, 0], 50, mode=0, timeout=15)
```

### Kinematics

Convert between angles and coordinates:

```python
# Angles to coordinates
coords = mc.angles_to_coords([0, 30, 45, -60, 45, 0])
print(f"Coordinates: {coords}")

# Coordinates to angles
angles = mc.solve_inv_kinematics([150, 0, 150, 0, 0, 0], current_angles)
print(f"Angles: {angles}")
```

### JOG Control

Manual control of individual joints/axes:

```python
# Jog joint 1 in positive direction
mc.jog_angle(1, 1, 50)  # joint_id, direction, speed

# Jog X axis in positive direction
mc.jog_coord(1, 1, 50)  # coord_id, direction, speed
```

### Servo Status

Get real-time feedback from servos:

```python
# Get servo speeds
speeds = mc.get_servo_speeds()

# Get servo currents
currents = mc.get_servo_currents()

# Get servo voltages
voltages = mc.get_servo_voltages()

# Get servo temperatures
temps = mc.get_servo_temps()

# Get servo status (voltage, sensor, temp, current, angle, overload)
status = mc.get_servo_status()
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SYSTEM FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User enters frame                                           │
│     │                                                           │
│     ├─► Camera detects person (YOLO)                            │
│     │                                                           │
│     └─► AI starts conversation automatically                          │
│                                                                  │
│  2. User holds SPACEBAR                                          │
│     │                                                           │
│     ├─► AI listens to speech                                      │
│     ├─► AI responds (audio)                                     │
│     └─► AI observes via video feed                                 │
│                                                                  │
│  3. User releases SPACEBAR                                       │
│     │                                                           │
│     └─► User marked as "has spoken"                                │
│                                                                  │
│  4. User leaves frame                                            │
│     │                                                           │
│     ├─► Backend detects: "user left after speaking"                   │
│     │                                                           │
│     └─► Trigger WebSocket signal to myCobot                          │
│                                                                  │
│  5. Robot responds                                               │
│     │                                                           │
│     └─► myCobot waves goodbye! 👋                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Detailed Architecture

```
┌─────────────────────┐         WebSocket (8765)          ┌──────────────────────┐
│   Nebula Backend    │◄───────────────────────────────────►│   myCobot Pi Server  │
│   (localhost:8000) │                                    │                      │
├─────────────────────┤                                    │  - Receives commands  │
│ - Person Detection  │                                    │  - Controls motors    │
│ - Speech Tracking   │                                    │  - Executes gestures  │
│ - Signal Trigger    │                                    │  - Sends feedback    │
└─────────────────────┘                                    └──────────────────────┘
         │                                                           │
   Detects user exits                                          Robot moves!
   after speaking                                                (wave, greet, etc.)
```

### Communication Protocol

**Nebula Backend → myCobot Pi (WebSocket):**

```json
{
  "signalType": "user_left_after_speaking",
  "timestamp": "2025-01-31T10:30:00",
  "data": {
    "action": "wave",
    "speed": "normal"
  }
}
```

**myCobot Pi → Nebula Backend (Response):**

```json
{
  "type": "response",
  "signalType": "user_left_after_speaking",
  "result": {
    "status": "success",
    "action": "wave",
    "message": "Waved hand!"
  },
  "timestamp": "2025-01-31T10:30:00"
}
```

---

## Quick Reference

### Start Everything (Complete Workflow)

**On myCobot Pi:**
```bash
ssh pi@<mycobot-ip>
python3 mycobot_server_320.py
```

**On Backend Machine:**
```bash
cd backend
source venv/bin/activate
pip install pymycobot websockets  # First time only
python main.py
```

**On Frontend Machine:**
```bash
cd frontend
npm run dev
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | `http://localhost:3001` | Main Nebula Talks app |
| Admin Dashboard | `http://localhost:8000/admin` | Event prompt management |
| Robot Dashboard | `http://localhost:8000/robot-dashboard.html` | Robot control panel |
| API Docs | `http://localhost:8000/docs` | FastAPI documentation |

### File Locations

| File | Location | Purpose |
|------|----------|---------|
| myCobot Server | `backend/mycobot_server_320.py` | Run on myCobot Pi |
| Backend Config | `backend/.env` | Robot connection settings |
| Frontend Main | `frontend/index.tsx` | Detection + AI integration |
| Robot Dashboard | `frontend/robot-dashboard.html` | Manual robot control |

---

## Resources

### Official Documentation

- [pymycobot GitHub](https://github.com/elephantrobotics/pymycobot)
- [MyCobot 320 API](https://github.com/elephantrobotics/pymycobot/blob/main/docs/MyCobot_320_en.md)
- [ElephantRobotics](https://www.elephantrobotics.com/)

### Community Support

- [pymycobot Issues](https://github.com/elephantrobotics/pymycobot/issues)
- [ElephantRobotics Forum](https://forum.elephantrobotics.com/)

---

## Changelog

### Version 2.0 - Updated for MyCobot 320 Pi

- Updated to use official `pymycobot.MyCobot320` class
- Corrected serial port to `/dev/ttyAMA0`
- Updated baudrate to `1000000`
- Added all MyCobot 320 API methods
- Improved error handling
- Added custom command support (angles, coordinates, single joint)
- Enhanced gesture sequences

### Version 1.0 - Initial Release

- Basic WebSocket server
- 6 predefined gestures
- Simple command execution

---

## Support

For issues or questions:
1. Check the logs in both backend and myCobot server
2. Verify network connectivity between machines
3. Ensure myCobot is powered on and connected
4. Review API docs at `http://localhost:8000/docs`

---

**Enjoy your myCobot 320 integration with Nebula Talks! 🤖️🤖️✨**
