# Nebula Talks

AI-powered interactive receptionist system with person detection, live voice conversation, and myCobot 320 Pi robot integration.

## 🏗️ Project Structure

```
nebula-talks/
├── frontend/                 # Frontend application
│   ├── index.html           # Main entry point
│   ├── index.tsx            # Main application logic
│   ├── index.css            # Styles
│   ├── utils.ts             # Utility functions
│   ├── visual-3d.ts          # 3D visualization
│   ├── admin.html           # Event prompt dashboard
│   ├── robot-dashboard.html  # Robot control dashboard
│   ├── public/              # Static assets
│   │   └── robot_playground.glb
│   ├── package.json         # Node.js dependencies
│   └── vite.config.ts       # Vite build config
│
├── backend/                 # FastAPI backend server
│   ├── main.py              # Main application & API endpoints
│   ├── detection.py         # YOLO person detection
│   ├── models.py            # Pydantic models
│   ├── robot_signal.py      # Robot communication service
│   ├── mycobot_integration.py  # myCobot WebSocket client
│   ├── mycobot_server.py    # myCobot server (run on Pi)
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Environment variables (API keys)
│   ├── venv/                # Python virtual environment
│   ├── event_prompts.json   # Event prompt storage
│   └── robots.json          # Robot configurations
│
└── README.md                # This file
```

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment

python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Start backend server
python main.py
```

Backend runs on: **http://localhost:8000**

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs on: **http://localhost:3001**

## 🎯 Features

- **Person Detection**: YOLO-based real-time person detection
- **Live Voice Chat**: Google Gemini Live Audio API integration
- **Event Management**: Configure prompts for different events
- **Robot Integration**: Control myCobot 320 Pi robot via WebSocket
- **Admin Dashboards**: Manage events and test robot gestures

## 📡 API Endpoints

### Person Detection
- `POST /detect` - Detect persons in image
- `GET /health` - Health check

### Configuration
- `GET /api/config` - Get API key and active event prompt

### Event Prompts
- `GET /api/prompts` - List all event prompts
- `POST /api/prompts` - Create new event prompt
- `PUT /api/prompts/{id}` - Update event prompt
- `DELETE /api/prompts/{id}` - Delete event prompt
- `POST /api/prompts/{id}/activate` - Activate event prompt

### Robot Control
- `GET /api/mycobot/status` - Check myCobot connection status
- `GET /api/mycobot/gestures` - List available gestures
- `POST /api/mycobot/gesture/{gesture}` - Trigger gesture
- `POST /api/robot/signal` - Send manual signal
- `POST /api/robot/mark-spoken` - Mark user as spoken

### Dashboards
- `GET /admin` - Event prompt management dashboard
- `GET /robot-dashboard.html` - Robot control dashboard
- `GET /` - Main application

## 🤖 myCobot Integration

### On myCobot Pi:

```bash
# SSH into your myCobot
ssh pi@<mycobot-ip>

# Install dependencies
pip3 install websockets pymycobot

# Copy mycobot_server.py and run
python3 mycobot_server.py
```

### On Backend Machine:

Edit `backend/.env`:
```
MYCOBOT_HOST=<mycobot-ip>
MYCOBOT_PORT=8765
```

See `backend/MYCOBOT_SETUP.md` for detailed setup instructions.

## 🎭 Available Robot Gestures

| Gesture | Description |
|---------|-------------|
| `wave` | Wave hand gesture |
| `thumbs_up` | Thumbs up |
| `point` | Point forward |
| `greet` | Bow and wave |
| `celebrate` | Celebration dance |
| `home` | Return to home position |

## 🔑 Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `YOLO_MODEL` | YOLO model (default: yolov8n.pt) |
| `MYCOBOT_HOST` | myCobot IP address |
| `MYCOBOT_PORT` | myCobot WebSocket port (default: 8765) |

## 📱 Dashboards

- **Main App**: http://localhost:3001
- **Event Prompts**: http://localhost:8000/admin
- **Robot Control**: http://localhost:8000/robot-dashboard.html

## 📂 Data Files

- `event_prompts.json` - Event prompt configurations
- `robots.json` - Robot connection configurations

## 🔧 Development

### Frontend (Vite)
```bash
cd frontend
npm run dev     # Development server
npm run build   # Production build
```

### Backend (FastAPI)
```bash
cd backend
source venv/bin/activate
python main.py    # Development server
```

