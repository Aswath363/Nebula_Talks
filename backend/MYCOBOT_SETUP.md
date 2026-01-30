# myCobot 320 Pi Setup Guide

Complete setup for connecting Nebula Talks to your myCobot 320 Pi robot.

## Prerequisites

- myCobot 320 Pi with Raspberry Pi
- Both devices on the same network
- SSH access to your myCobot Pi (optional)

---

## Part 1: Setup on myCobot Pi

### 1. SSH into your myCobot Pi
```bash
ssh pi@<mycobot-ip-address>
# Default password is usually 'pi' or '123456'
```

### 2. Install Python dependencies
```bash
pip3 install websockets pymycobot
```

### 3. Copy the myCobot server script
Copy `mycobot_server.py` to your myCobot Pi:
```bash
# From your main machine
scp backend/mycobot_server.py pi@<mycobot-ip>:~/
```

Or create it directly on the Pi using nano/nano.

### 4. Run the myCobot server
```bash
python3 mycobot_server.py
```

You should see:
```
INFO - Starting myCobot WebSocket server on 0.0.0.0:8765
INFO - Waiting for Nebula Talks connection...
INFO - myCobot connected and powered on
```

### 5. Note your myCobot's IP address
```bash
hostname -I
```
Example: `192.168.1.100`

---

## Part 2: Setup on Nebula Backend Machine

### 1. Install dependencies
```bash
cd backend
source venv/bin/activate
pip install websockets
```

### 2. Configure myCobot connection

Edit `backend/.env`:
```bash
# myCobot 320 Pi Configuration
MYCOBOT_HOST=192.168.1.100  # Your myCobot's IP
MYCOBOT_PORT=8765
```

### 3. Restart the backend
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

## Part 3: Test the Connection

### Test from API
```bash
curl http://localhost:8000/api/mycobot/status
```

Should return:
```json
{
  "connected": true,
  "host": "192.168.1.100",
  "port": 8765
}
```

### Test a gesture via API
```bash
curl -X POST http://localhost:8000/api/mycobot/gesture/wave
```

Your myCobot should wave! 🤖

---

## Available Gestures

| Gesture | API Endpoint | Description |
|---------|-------------|-------------|
| **wave** | `/api/mycobot/gesture/wave` | Wave hand gesture |
| **thumbs_up** | `/api/mycobot/gesture/thumbs_up` | Thumbs up |
| **point** | `/api/mycobot/gesture/point` | Point forward |
| **greet** | `/api/mycobot/gesture/greet` | Greeting (bow + wave) |
| **celebrate** | `/api/mycobot/gesture/celebrate` | Celebration |
| **home** | `/api/mycobot/gesture/home` | Return to home |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        FLOW                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User enters frame   ──────────────►  Camera detects    │
│                                                              │
│  2. User holds SPACE   ───────────────►  AI listening      │
│                                                              │
│  3. User releases SPACE  ────────────►  User "marked spoken" │
│                                                              │
│  4. User leaves frame  ──────────────►  Trigger signal!    │
│                                                              │
│  5. Backend sends WebSocket  ────────►  myCobot waves!      │
│     signal to myCobot                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Customization

### Add custom gestures

Edit `mycobot_server.py` and add your method:

```python
def custom_gesture(self):
    """My custom gesture"""
    # Your custom coordinates
    self.mc.send_angles([0, 30, 45, -60, 45, 0], 50)
    sleep(1)
    self.go_home()
```

Then add to `execute_command`:

```python
elif action == "custom":
    self.custom_gesture()
    return {"status": "success", "action": "custom"}
```

---

## Troubleshooting

### myCobot not connecting
```bash
# Check if myCobot server is running on Pi
ssh pi@<mycobot-ip> "ps aux | grep mycobot_server"

# Test WebSocket connection
wscat -c ws://<mycobot-ip>:8765
```

### Backend can't find myCobot
```bash
# Ping myCobot from backend machine
ping <mycobot-ip>

# Check firewall
sudo ufw allow 8765
```

### Robot not moving
```bash
# Check if myCobot is powered on
# Check serial connection on Pi
ls /dev/ttyAMA0

# Test pymycobot directly
python3 -c "from pymycobot import MyCobot; mc = MyCobot('/dev/ttyAMA0'); mc.power_on()"
```

---

## Architecture

```
┌─────────────────────┐         WebSocket          ┌──────────────────────┐
│   Nebula Backend    │◄──────────────────────────►│   myCobot Pi Server  │
│                     │       Port 8765              │                      │
│  - Person Detection │                              │  - Receives commands  │
│  - Speech Tracking  │                              │  - Controls arm      │
│  - Signal Trigger   │                              │  - Sends feedback    │
└─────────────────────┘                              └──────────────────────┘
          │                                                   │
          ▼                                                   ▼
   Detects user exits                                Controls motors
   after speaking                                      via pymycobot
```
