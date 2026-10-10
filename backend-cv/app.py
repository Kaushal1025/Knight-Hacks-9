
# ==========================================
# SHAPESHIFT - COMPUTER VISION BACKEND
# OpenCV + MediaPipe + Flask + Socket.IO
# ==========================================

import os
import time
import math
import threading

import cv2
import mediapipe as mp

from flask import Flask, jsonify
from flask_socketio import SocketIO


# ==========================================
# 1. FLASK AND SOCKET.IO SETUP
# ==========================================

app = Flask(__name__)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)


@app.route("/")
def home():
    return jsonify({
        "message": "ShapeShift CV Backend Running!"
    })


@app.route("/health")
def health():
    return jsonify({
        "status": "ok"
    })


# ==========================================
# 2. MEDIAPIPE CONFIGURATION
# ==========================================

MODEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "hand_landmarker.task"
)

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path=MODEL_PATH
    ),
    running_mode=RunningMode.VIDEO,
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5
)


# ==========================================
# 3. HAND LANDMARK CONNECTIONS
# ==========================================

CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17)
]


# ==========================================
# 4. EXTRACT LANDMARK DATA
# ==========================================

def extract_hand_data(result):
    hands_data = []

    for index, hand_landmarks in enumerate(
        result.hand_landmarks
    ):
        landmarks = []

        for point in hand_landmarks:
            landmarks.append({
                "x": float(point.x),
                "y": float(point.y),
                "z": float(point.z)
            })

        hand_label = "Unknown"

        if index < len(result.handedness):
            hand_label = (
                result.handedness[index][0].category_name
            )
        # Correct reversed handedness labels
        if hand_label == "Left":
            hand_label = "Right"
        elif hand_label == "Right":
            hand_label = "Left"

        hands_data.append({
            "hand": hand_label,
            "landmarks": landmarks
        })

    return hands_data


# ==========================================
# 5. PINCH DETECTION
# ==========================================

def landmark_distance(a, b):
    return math.sqrt(
        (a["x"] - b["x"]) ** 2 +
        (a["y"] - b["y"]) ** 2
    )


def pinch_distance(landmarks):
    thumb = landmarks[4]
    index = landmarks[8]

    wrist = landmarks[0]
    index_base = landmarks[5]

    distance = landmark_distance(thumb, index)

    hand_size = landmark_distance(
        wrist,
        index_base
    )

    return distance / max(hand_size, 0.001)


# Pinch thresholds
# Two thresholds prevent rapid flickering
PINCH_START_THRESHOLD = 0.35
PINCH_END_THRESHOLD = 0.48


# ==========================================
# 6. GESTURE STATE TRACKING
# ==========================================

previous_pinch = {
    "Left": False,
    "Right": False
}


def process_gestures(hands):
    visible_hands = set()

    for hand in hands:
        landmarks = hand["landmarks"]
        label = hand["hand"]

        visible_hands.add(label)

        thumb = landmarks[4]
        index = landmarks[8]

        position = {
            "x": (thumb["x"] + index["x"]) / 2,
            "y": (thumb["y"] + index["y"]) / 2,
            "z": (thumb["z"] + index["z"]) / 2
        }

        distance = pinch_distance(landmarks)

        was_pinching = previous_pinch.get(
            label,
            False
        )

        # Hysteresis:
        # Start pinch at smaller distance
        # End pinch at larger distance
        if was_pinching:
            pinching = distance < PINCH_END_THRESHOLD
        else:
            pinching = distance < PINCH_START_THRESHOLD

        if pinching and not was_pinching:
            gesture = "grab_start"

        elif pinching and was_pinching:
            gesture = "grabbing"

        elif not pinching and was_pinching:
            gesture = "grab_end"

        else:
            gesture = "none"

        hand["pinching"] = pinching
        hand["gesture"] = gesture
        hand["position"] = position
        hand["pinch_distance"] = round(distance, 3)

        previous_pinch[label] = pinching

        # Print only gesture transitions
        if gesture in ("grab_start", "grab_end"):
            print(
                f"{label}: {gesture}",
                flush=True
            )

    # Reset states when hands disappear
    for label in previous_pinch:
        if label not in visible_hands:
            previous_pinch[label] = False

    return hands


# ==========================================
# 7. DRAW HAND LANDMARKS
# ==========================================

def draw_hands(frame, hands):
    height, width = frame.shape[:2]

    for hand in hands:
        points = hand["landmarks"]

        # Draw skeleton connections
        for start, end in CONNECTIONS:
            p1 = points[start]
            p2 = points[end]

            x1 = int(p1["x"] * width)
            y1 = int(p1["y"] * height)

            x2 = int(p2["x"] * width)
            y2 = int(p2["y"] * height)

            cv2.line(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2
            )

        # Draw landmark points
        for point in points:
            x = int(point["x"] * width)
            y = int(point["y"] * height)

            cv2.circle(
                frame,
                (x, y),
                4,
                (0, 0, 255),
                -1
            )

    return frame


# ==========================================
# 8. DRAW GESTURE STATUS
# ==========================================

def draw_gesture_status(frame, hands):
    cv2.putText(
        frame,
        f"Hands detected: {len(hands)}",
        (20, 35),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2
    )

    for i, hand in enumerate(hands):
        gesture = hand["gesture"]
        label = hand["hand"]

        if gesture == "grab_start":
            color = (0, 255, 0)
        elif gesture == "grabbing":
            color = (0, 255, 255)
        elif gesture == "grab_end":
            color = (0, 0, 255)
        else:
            color = (255, 255, 255)

        cv2.putText(
            frame,
            f"{label}: {gesture}",
            (20, 80 + i * 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            color,
            2
        )

        cv2.putText(
            frame,
            f"Pinch distance: {hand['pinch_distance']:.3f}",
            (20, 180 + i * 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2
        )

    return frame


# ==========================================
# 9. WEBCAM PROCESSING LOOP
# ==========================================

def camera_loop():
    print("Starting webcam...", flush=True)

    cap = cv2.VideoCapture(
        0,
        cv2.CAP_DSHOW
    )

    if not cap.isOpened():
        print(
            "ERROR: Could not open webcam!",
            flush=True
        )
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)

    print(
        "Webcam started successfully!",
        flush=True
    )

    start_time = time.monotonic()
    last_timestamp = -1

    try:
        with HandLandmarker.create_from_options(
            options
        ) as landmarker:

            while True:
                success, frame = cap.read()

                if not success:
                    print(
                        "Failed to read webcam frame.",
                        flush=True
                    )
                    break

                # Mirror webcam image
                frame = cv2.flip(frame, 1)

                # Convert BGR to RGB
                rgb = cv2.cvtColor(
                    frame,
                    cv2.COLOR_BGR2RGB
                )

                # MediaPipe image
                mp_image = mp.Image(
                    image_format=mp.ImageFormat.SRGB,
                    data=rgb
                )

                # Generate timestamp
                timestamp = int(
                    (time.monotonic() - start_time)
                    * 1000
                )

                timestamp = max(
                    timestamp,
                    last_timestamp + 1
                )

                last_timestamp = timestamp

                # Detect hands
                result = landmarker.detect_for_video(
                    mp_image,
                    timestamp
                )

                # Extract landmarks
                hands = extract_hand_data(result)

                # Detect gestures and hand positions
                hands = process_gestures(hands)

                # Send data to React frontend
                socketio.emit(
                    "hand_data",
                    {
                        "timestamp": timestamp,
                        "hands": hands
                    }
                )

                # Draw hand landmarks
                frame = draw_hands(
                    frame,
                    hands
                )

                # Draw gesture labels
                frame = draw_gesture_status(
                    frame,
                    hands
                )

                # Display webcam
                cv2.imshow(
                    "ShapeShift Hand Tracking",
                    frame
                )

                # Press Q to close webcam
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except Exception as error:
        print(
            "Camera error:",
            error,
            flush=True
        )

    finally:
        cap.release()
        cv2.destroyAllWindows()

        print(
            "Webcam stopped.",
            flush=True
        )


# ==========================================
# 10. WEBSOCKET EVENTS
# ==========================================

@socketio.on("connect")
def connected():
    print(
        "Frontend connected!",
        flush=True
    )


@socketio.on("disconnect")
def disconnected(reason=None):
    print(
        "Frontend disconnected!",
        flush=True
    )


# ==========================================
# 11. START SHAPESHIFT SERVER
# ==========================================

if __name__ == "__main__":
    print(
        "Starting ShapeShift CV Server...",
        flush=True
    )

    camera_thread = threading.Thread(
        target=camera_loop,
        daemon=True
    )

    camera_thread.start()

    print(
        "Server: http://localhost:5000",
        flush=True
    )

    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=False,
        allow_unsafe_werkzeug=True
    )
