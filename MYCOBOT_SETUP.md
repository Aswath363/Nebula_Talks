# myCobot 320 Pi - Setup & Usage Guide

Complete guide for connecting Nebula Talks to your myCobot 320 Pi robot arm.

---

## Table of Contents

- [Part 1: Setup on myCobot Pi](#part-1-setup-on-mycobot-pi)
- [Part 2: Configure Backend](#part-2-configure-backend)
- [Part 3: Test Connection](#part-3-test-connection)
- [Part 4: Available Gestures](#part-4-available-gestures)
- [Part 5: Using the Robot](#part-5-using-the-robot)
- [Troubleshooting](#troubleshooting)
- [Architecture Overview](#architecture-overview)

---

## Part 1: Setup on myCobot Pi

### 1. SSH into your myCobot Pi

```bash
ssh pi@<mycobot-ip-address>
# Default password: 'pi' or '123456'
```

### 2. Install dependencies

```bash
pip3 install websockets pymycobot
```

### 3. Copy server script

The `mycobot_server.py` file is included in your repository. Copy it to your myCobot Pi:

```bash
# From your main machine
scp backend/mycobot_server.py pi@<mycobot-ip>:~/
```

### 4. Run myCobot server

```bash
python3 mycobot_server.py
```

You should see:
```
INFO - Starting myCobot WebSocket server on 0.0.0.0:8765
INFO - Waiting for Nebula Talks connection...
INFO - myCobot connected and powered on
```

### 5. Note your myCobot IP address

```bash
hostname -I
# Example: 192.168.1.100
```

---

## Part 2: Configure Backend

### 1. Edit backend environment variables

Edit `backend/.env`:

```bash
# myCobot 320 Pi Configuration
MYCOBOT_HOST=192.168.1.100  # Replace with your myCobot's IP
MYCOBOT_PORT=8765
```

### 2. Restart backend

```bash
cd backend
source venv/bin/activate
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

### Test a gesture

```bash
curl -X POST http://localhost:8000/api/mycobot/gesture/wave
```

Your myCobot should wave! 👋

---

## Part 4: Available Gestures

| Gesture | API Endpoint | Description |
|---------|-------------|-------------|
| **wave** | `/api/mycobot/gesture/wave` | Wave hand gesture |
| **thumbs_up** | `/api/mycobot/gesture/thumbs_up` | Thumbs up |
| **point** | `/api/mycobot/gesture/point` | Point forward |
| **greet** | `/api/mycobot/gesture/greet` | Greeting (bow + wave) |
| **celebrate** | `/api/mycobot/gesture/celebrate` | Celebration |
| **home** | `/api/mycobot/gesture/home` | Return to home position |

---

## Part 5: Using the Robot

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

---

## Troubleshooting

### Can't connect to myCobot?

**Check if myCobot server is running:**
```bash
ssh pi@<mycobot-ip> "ps aux | grep mycobot_server"
```

**Test WebSocket connection:**
```bash
wscat -c ws://<mycobot-ip>:8765
```

### Robot not moving?

**Check if myCobot is powered on:**
```bash
ssh pi@<mycobot-ip> "python3 -c 'from pymycobot import MyCobot; mc = MyCombat(\"/dev/ttyAMA0\"); mc.power_on()'"
```

**Check serial connection:**
```bash
ls /dev/ttyAMA0
```

### Firewall issues?

**Allow port 8765 on myCobot Pi:**
```bash
sudo ufw allow 8765
```

### Backend can't find myCobot?

**Ping myCobot from backend machine:**
```bash
ping <mycobot-ip>
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SYSTEM FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User enters frame                                          │
│     │                                                           │
│     ├─► Camera detects person (YOLO)                            │
│     │                                                           │
│     └─► AI starts conversation automatically                     │
│                                                                 │
│  2. User holds SPACEBAR                                         │
│     │                                                           │
│     ├─► AI listens to speech                                    │
│     ├─► AI responds (audio)                                    │
│     └─► AI observes via video feed                              │
│                                                                 │
│  3. User releases SPACEBAR                                      │
│     │                                                           │
│     └─► User marked as "has spoken"                            │
│                                                                 │
│  4. User leaves frame                                          │
│     │                                                           │
│     ├─► Backend detects: "user left after speaking"              │
│     │                                                           │
│     └─► Trigger WebSocket signal to myCobot                     │
│                                                                 │
│  5. Robot responds                                             │
│     │                                                           │
│     └─► myCobot waves goodbye! 👋                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Architecture

```
┌─────────────────────┐         WebSocket (8765)          ┌──────────────────────┐
│   Nebula Backend    │◄───────────────────────────────────►│   myCobot Pi Server  │
│   (localhost:8000) │                                    │                      │
├─────────────────────┤                                    │  - Receives commands  │
│ - Person Detection  │                                    │  - Controls motors    │
│ - Speech Tracking   │                                    │  - Executes gestures  │
│ - Signal Trigger    │                                    └──────────────────────┘
└─────────────────────┘                                             │
         │                                                           ▼
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

## Advanced Configuration

### Adding Custom Gestures

Edit `mycobot_server.py` to add new gestures:

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

### Gripper Control

```python
def open_gripper(self):
    """Open gripper"""
    if self.mc:
        self.mc.set_gripper_value(100, 50)
        sleep(0.5)

def close_gripper(self):
    """Close gripper"""
    if self.mc:
        self.mc.set_gripper_value(0, 50)
        sleep(0.5)
```

---

## Quick Reference

### Start Everything (Complete Workflow)

**On myCobot Pi:**
```bash
ssh pi@<mycobot-ip>
python3 mycobot_server.py
```

**On Backend Machine:**
```bash
cd backend
source venv/bin/activate
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
| myCobot Server | `backend/mycobot_server.py` | Run on myCobot Pi |
| Backend Config | `backend/.env` | Robot connection settings |
| Frontend Main | `frontend/index.tsx` | Detection + AI integration |
| Robot Dashboard | `frontend/robot-dashboard.html` | Manual robot control |

---

## Support

For issues or questions:
1. Check the logs in both backend and myCobot server
2. Verify network connectivity between machines
3. Ensure myCobot is powered on and connected
4. Review API docs at `http://localhost:8000/docs`

---

**Enjoy your myCobot integration with Nebula Talks! 🤖✨**
