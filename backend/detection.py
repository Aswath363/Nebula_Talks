"""
YOLO-based person detection service
"""
import io
import time
import base64
from PIL import Image
from ultralytics import YOLO
from typing import Optional, Tuple, Dict


class PersonDetector:
    """
    YOLO-based person detection service
    """

    def __init__(self, model_name: str = "yolov8n.pt"):
        """
        Initialize YOLO model
        Args:
            model_name: YOLO model variant (yolov8n.pt for speed, yolov8s.pt for accuracy)
        """
        self.model = YOLO(model_name)
        self.target_class_id = 0  # COCO class ID for 'person'

    def decode_base64_image(self, base64_string: str) -> Image.Image:
        """
        Decode base64 image string to PIL Image
        Args:
            base64_string: Base64 encoded image (with or without data URI prefix)
        Returns:
            PIL Image object
        """
        # Remove data URI prefix if present
        if "," in base64_string:
            base64_string = base64_string.split(",", 1)[1]

        # Decode base64
        image_bytes = base64.b64decode(base64_string)

        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_bytes))

        # Convert RGB if needed (YOLO expects RGB)
        if image.mode != "RGB":
            image = image.convert("RGB")

        return image

    def detect_person(
        self,
        image_data: str,
        confidence_threshold: float = 0.6
    ) -> Tuple[bool, float, Optional[Dict], float]:
        """
        Detect if a person is present in the image

        Args:
            image_data: Base64 encoded image string
            confidence_threshold: Minimum confidence for detection (0-1)

        Returns:
            Tuple of (person_found, max_confidence, bounding_box_dict, processing_time_ms)
        """
        start_time = time.time()

        try:
            # Decode image
            image = self.decode_base64_image(image_data)

            # Run YOLO inference
            results = self.model(image, verbose=False)

            # Extract detections
            person_found = False
            max_confidence = 0.0
            best_box = None

            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        # Check if class is 'person' (class_id=0 in COCO)
                        if int(box.cls[0]) == self.target_class_id:
                            confidence = float(box.conf[0])

                            if confidence > max_confidence:
                                max_confidence = confidence

                                # Extract bounding box coordinates
                                x1, y1, x2, y2 = box.xyxy[0].tolist()
                                best_box = {
                                    "x1": x1,
                                    "y1": y1,
                                    "x2": x2,
                                    "y2": y2
                                }

            # Apply confidence threshold
            person_found = max_confidence >= confidence_threshold

            processing_time = (time.time() - start_time) * 1000  # Convert to ms

            return person_found, max_confidence, best_box, processing_time

        except Exception as e:
            print(f"Detection error: {e}")
            return False, 0.0, None, 0.0
