"""
FastAPI backend for YOLO-based person detection and event prompt management
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Dict, Optional, List
import os
import json
from datetime import datetime
from dotenv import load_dotenv
import asyncio

# Load environment variables
load_dotenv()

from detection import PersonDetector
from models import PersonDetectionRequest, PersonDetectionResponse, HealthResponse
from robot_signal import robot_service, RobotConfig, RobotSignal, RobotProtocol
from mycobot_integration import (
    mycobot_client,
    start_mycobot_connection,
    send_to_mycobot,
    MYCOBOT_GESTURES,
)

# Global detector instance
detector: PersonDetector = None

# File to store event prompts
PROMPTS_FILE = "event_prompts.json"

# Robot state tracking
user_was_present = False
user_spoken = False

# myCobot configuration (can be overridden via environment)
MYCOBOT_HOST = os.getenv("MYCOBOT_HOST", "localhost")
MYCOBOT_PORT = int(os.getenv("MYCOBOT_PORT", "8765"))


class EventPrompt(BaseModel):
    name: str
    description: str
    system_instruction: str
    voice: str = "Orus"
    is_active: bool = False


class EventPromptCreate(BaseModel):
    name: str
    description: str
    system_instruction: str
    voice: str = "Orus"


class EventPromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_instruction: Optional[str] = None
    voice: Optional[str] = None
    is_active: Optional[bool] = None


class ConfigResponse(BaseModel):
    apiKey: str
    eventPrompt: Optional[dict] = None


def load_prompts() -> Dict[str, dict]:
    """Load prompts from JSON file"""
    if os.path.exists(PROMPTS_FILE):
        with open(PROMPTS_FILE, "r") as f:
            return json.load(f)
    return {}


def save_prompts(prompts: Dict[str, dict]):
    """Save prompts to JSON file"""
    with open(PROMPTS_FILE, "w") as f:
        json.dump(prompts, f, indent=2)


def initialize_default_prompt():
    """Initialize default Nebula Talks prompt if none exists"""
    prompts = load_prompts()
    if not prompts:
        prompts["nebula-talks"] = {
            "id": "nebula-talks",
            "name": "Nebula Talks",
            "description": "AI Receptionist for Nebula Talks - Visual Intelligence event",
            "system_instruction": """You are the witty, observant, and welcoming AI Receptionist for "Nebula Talks".

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

IMPORTANT: When the session starts (you hear audio begin), IMMEDIATELY start with your greeting. Don't wait for the user to speak first - YOU initiate the conversation!

Tone: Energetic, funny, professional but casual.""",
            "voice": "Orus",
            "is_active": True,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        save_prompts(prompts)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for model loading"""
    global detector

    # Initialize default prompt
    initialize_default_prompt()

    # Load robot configurations
    print("Loading robot configurations...")
    await robot_service.load_robots()
    print(f"Loaded {len(robot_service.robots)} robot(s)")

    # Start myCobot connection
    print(f"Connecting to myCobot at {MYCOBOT_HOST}:{MYCOBOT_PORT}...")
    mycobot_client.host = MYCOBOT_HOST
    mycobot_client.port = MYCOBOT_PORT
    asyncio.create_task(start_mycobot_connection())

    # Load YOLO model on startup
    print("Loading YOLO model...")
    model_variant = os.getenv("YOLO_MODEL", "yolov8n.pt")
    detector = PersonDetector(model_name=model_variant)
    print(f"YOLO model loaded: {model_variant}")

    yield

    # Cleanup
    print("Shutting down...")
    await robot_service.cleanup()
    await mycobot_client.disconnect()


# Initialize FastAPI app
app = FastAPI(
    title="Nebula Talks Person Detection API",
    description="YOLO-based person detection for Nebula Talks",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(status="healthy", model_loaded=detector is not None)


@app.post("/detect", response_model=PersonDetectionResponse)
async def detect_person(request: PersonDetectionRequest):
    """Detect if a person is present in the provided image"""
    global user_was_present, user_spoken

    if detector is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        person_found, confidence, bounding_box, processing_time = (
            detector.detect_person(
                image_data=request.image_data,
                confidence_threshold=request.confidence_threshold,
            )
        )

        # Robot signal logic: Track user presence and speaking
        user_is_present = person_found

        # If user was NOT present and now IS present -> person entered frame
        if not user_was_present and user_is_present:
            print("🚶 Person entered frame - going to celebration pose")
            # Send celebration pose signal to myCobot
            await send_to_mycobot("go_to_celebrate_pose")

        # If user was present and spoke, and now left frame -> send robot signal
        if user_was_present and user_spoken and not user_is_present:
            print("👤 User left after speaking - sending wave signal to myCobot")
            # Send to myCobot
            await send_to_mycobot("wave_hand")

            # Also send to any other configured robots
            signal = RobotSignal(
                signal_type="user_left_after_speaking",
                data={"confidence": confidence, "frame_id": request.frame_id},
            )
            await robot_service.send_signal(signal)
            # Reset state
            user_spoken = False

        # If user was present and now NOT present (with or without speaking) -> hold pose and go home
        if user_was_present and not user_is_present:
            print("👋 Person left frame - holding celebration pose and going home")
            await send_to_mycobot("hold_and_home")

        user_was_present = user_is_present

        response = PersonDetectionResponse(
            person_found=person_found,
            confidence=confidence,
            bounding_box=bounding_box,
            processing_time_ms=processing_time,
            frame_id=request.frame_id,
        )

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@app.post("/api/robot/signal")
async def trigger_robot_signal(signal_type: str, robot_id: Optional[str] = None):
    """
    Manually trigger a robot signal

    Common signal types:
    - "user_left_after_speaking": User left frame after speaking
    - "wave_hand": Robot should wave
    - "point": Robot should point
    - "thumbs_up": Robot should give thumbs up
    - "greet": Robot should perform greeting
    - "idle": Robot should return to idle state
    """
    signal = RobotSignal(signal_type=signal_type)
    await robot_service.send_signal(signal, robot_id)
    return {"message": f"Signal '{signal_type}' sent to robots"}


@app.post("/api/robot/mark-spoken")
async def mark_user_spoken():
    """Mark that the user has spoken (for robot signal tracking)"""
    global user_spoken
    user_spoken = True
    return {"status": "marked"}


# Robot Management Endpoints
@app.get("/api/robots")
async def get_robots():
    """Get all configured robots"""
    robots = [
        {
            "id": r.id,
            "name": r.name,
            "protocol": r.protocol.value,
            "enabled": r.enabled,
            "url": r.url,
            "mqtt_broker": r.mqtt_broker,
            "mqtt_topic": r.mqtt_topic,
            "serial_port": r.serial_port,
        }
        for r in robot_service.robots.values()
    ]
    return {"robots": robots}


@app.get("/api/robots/serial-ports")
async def list_serial_ports():
    """List available serial ports for robot connection"""
    return {"ports": robot_service.list_serial_ports()}


@app.post("/api/robots")
async def add_robot(robot: dict):
    """Add a new robot configuration"""
    robot_config = RobotConfig(
        id=robot["id"],
        name=robot["name"],
        protocol=RobotProtocol(robot["protocol"]),
        enabled=robot.get("enabled", True),
        url=robot.get("url"),
        headers=robot.get("headers", {}),
        mqtt_broker=robot.get("mqtt_broker"),
        mqtt_port=robot.get("mqtt_port", 1883),
        mqtt_topic=robot.get("mqtt_topic"),
        mqtt_username=robot.get("mqtt_username"),
        mqtt_password=robot.get("mqtt_password"),
        serial_port=robot.get("serial_port"),
        serial_baudrate=robot.get("serial_baudrate", 9600),
        commands=robot.get("commands", {}),
    )
    robot_service.add_robot(robot_config)
    return {"message": f"Robot '{robot_config.name}' added"}


@app.delete("/api/robots/{robot_id}")
async def delete_robot(robot_id: str):
    """Delete a robot configuration"""
    if robot_id not in robot_service.robots:
        raise HTTPException(status_code=404, detail="Robot not found")
    robot_service.remove_robot(robot_id)
    return {"message": f"Robot '{robot_id}' deleted"}


@app.post("/api/robots/{robot_id}/test")
async def test_robot(robot_id: str):
    """Send a test signal to a specific robot"""
    if robot_id not in robot_service.robots:
        raise HTTPException(status_code=404, detail="Robot not found")

    signal = RobotSignal(
        signal_type="test", data={"message": "Test signal from Nebula Talks"}
    )

    success = await robot_service._send_to_robot(robot_service.robots[robot_id], signal)
    return {
        "success": success,
        "message": "Test signal sent" if success else "Test signal failed",
    }


# ========== myCobot Specific Endpoints ==========


@app.get("/api/mycobot/status")
async def mycobot_status():
    """Get myCobot connection status"""
    return {
        "connected": mycobot_client.connected,
        "host": mycobot_client.host,
        "port": mycobot_client.port,
    }


@app.get("/api/mycobot/gestures")
async def list_mycobot_gestures():
    """List available myCobot gestures"""
    return MYCOBOT_GESTURES


@app.post("/api/mycobot/gesture/{gesture}")
async def trigger_mycobot_gesture(gesture: str):
    """
    Trigger a specific myCobot gesture

    Available gestures:
    - wave: Wave hand
    - thumbs_up: Thumbs up
    - point: Point forward
    - greet: Greeting (bow + wave)
    - celebrate: Celebration
    - home: Return to home position
    """
    if gesture not in MYCOBOT_GESTURES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown gesture. Available: {', '.join(MYCOBOT_GESTURES.keys())}",
        )

    success = await send_to_mycobot(gesture)
    return {
        "success": success,
        "gesture": gesture,
        "message": MYCOBOT_GESTURES[gesture],
    }


@app.post("/api/mycobot/custom")
async def mycobot_custom_command(command: dict):
    """
    Send a custom command to myCobot

    Example:
    {
        "action": "move_to",
        "coordinates": [150, 0, 150]
    }
    """
    success = await send_to_mycobot("custom", command)
    return {"success": success, "command": command}


@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    """Return the Gemini API key and active event prompt"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    # Get active event prompt
    prompts = load_prompts()
    active_prompt = None
    for prompt_data in prompts.values():
        if prompt_data.get("is_active"):
            active_prompt = prompt_data
            break

    return ConfigResponse(apiKey=api_key, eventPrompt=active_prompt)


# Event Prompt Management Endpoints
@app.get("/api/prompts")
async def get_all_prompts():
    """Get all event prompts"""
    prompts = load_prompts()
    return {"prompts": list(prompts.values())}


@app.get("/api/prompts/{prompt_id}")
async def get_prompt(prompt_id: str):
    """Get a specific event prompt"""
    prompts = load_prompts()
    if prompt_id not in prompts:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompts[prompt_id]


@app.post("/api/prompts", response_model=dict)
async def create_prompt(prompt: EventPromptCreate):
    """Create a new event prompt"""
    prompts = load_prompts()

    # Generate ID from name
    prompt_id = prompt.name.lower().replace(" ", "-").replace("/", "-")

    if prompt_id in prompts:
        raise HTTPException(
            status_code=400, detail="Prompt with this name already exists"
        )

    prompt_data = {
        "id": prompt_id,
        "name": prompt.name,
        "description": prompt.description,
        "system_instruction": prompt.system_instruction,
        "voice": prompt.voice,
        "is_active": False,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }

    prompts[prompt_id] = prompt_data
    save_prompts(prompts)

    return prompt_data


@app.put("/api/prompts/{prompt_id}")
async def update_prompt(prompt_id: str, prompt: EventPromptUpdate):
    """Update an existing event prompt"""
    prompts = load_prompts()

    if prompt_id not in prompts:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Update fields
    if prompt.name is not None:
        prompts[prompt_id]["name"] = prompt.name
    if prompt.description is not None:
        prompts[prompt_id]["description"] = prompt.description
    if prompt.system_instruction is not None:
        prompts[prompt_id]["system_instruction"] = prompt.system_instruction
    if prompt.voice is not None:
        prompts[prompt_id]["voice"] = prompt.voice
    if prompt.is_active is not None:
        # If setting this as active, deactivate all others
        if prompt.is_active:
            for pid in prompts:
                prompts[pid]["is_active"] = False
        prompts[prompt_id]["is_active"] = prompt.is_active

    prompts[prompt_id]["updated_at"] = datetime.now().isoformat()
    save_prompts(prompts)

    return prompts[prompt_id]


@app.delete("/api/prompts/{prompt_id}")
async def delete_prompt(prompt_id: str):
    """Delete an event prompt"""
    prompts = load_prompts()

    if prompt_id not in prompts:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Don't allow deleting if it's the only prompt
    if len(prompts) == 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only prompt")

    deleted = prompts.pop(prompt_id)
    save_prompts(prompts)

    return {"message": "Prompt deleted", "deleted": deleted}


@app.post("/api/prompts/{prompt_id}/activate")
async def activate_prompt(prompt_id: str):
    """Activate a specific event prompt (deactivates all others)"""
    prompts = load_prompts()

    if prompt_id not in prompts:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Deactivate all and activate the specified one
    for pid in prompts:
        prompts[pid]["is_active"] = pid == prompt_id
        prompts[pid]["updated_at"] = datetime.now().isoformat()

    save_prompts(prompts)

    return {
        "message": f"Prompt '{prompts[prompt_id]['name']}' activated",
        "prompt": prompts[prompt_id],
    }


@app.get("/api/prompts/{prompt_id}/activate", response_model=dict)
async def get_active_prompt():
    """Get the currently active prompt"""
    prompts = load_prompts()

    for prompt_data in prompts.values():
        if prompt_data.get("is_active"):
            return prompt_data

    raise HTTPException(status_code=404, detail="No active prompt found")


# Serve admin dashboard
@app.get("/admin")
async def admin_dashboard():
    """Serve the admin dashboard"""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    admin_path = os.path.join(project_root, "frontend", "admin.html")
    return FileResponse(admin_path)


@app.get("/robot-dashboard")
@app.get("/robot-dashboard.html")
async def robot_dashboard():
    """Serve the robot control dashboard"""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dashboard_path = os.path.join(project_root, "frontend", "robot-dashboard.html")
    return FileResponse(dashboard_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
