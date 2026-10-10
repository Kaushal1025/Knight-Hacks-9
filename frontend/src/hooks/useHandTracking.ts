
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export interface HandData {
  hand: string;
  pinching: boolean;
  gesture: "grab_start" | "grabbing" | "grab_end" | "none";
  position: {
    x: number;
    y: number;
    z: number;
  };
  pinch_distance: number;
  landmarks: Array<{
    x: number;
    y: number;
    z: number;
  }>;
}

/** Two-hand scaling state from the CV backend (absent on older backends). */
export interface ScalingData {
  active: boolean;
  /** Relative to the hand distance when both hands started pinching. 1.0 = original size. */
  scale_factor: number;
}

interface TrackingData {
  timestamp: number;
  hands: HandData[];
  scaling?: ScalingData | null;
}

const socket = io(
  import.meta.env.VITE_CV_SERVER_URL || "http://localhost:5000",
  {
    autoConnect: false,
  }
);

export function useHandTracking() {
  const [hands, setHands] = useState<HandData[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [scaling, setScaling] = useState<ScalingData | null>(null);

  useEffect(() => {
    const onConnect = () => {
      console.log("Connected to ShapeShift CV backend!");
      setConnected(true);
      setError("");
    };

    const onDisconnect = () => {
      console.log("Disconnected from CV backend");
      setConnected(false);
      setHands([]);
      setScaling(null);
    };

    const onHandData = (data: TrackingData) => {
      setHands(data.hands);
      setScaling(data.scaling ?? null);
    };

    const onError = (err: Error) => {
      console.error("Socket.IO connection error:", err.message);
      setError(err.message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("hand_data", onHandData);
    socket.on("connect_error", onError);

    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("hand_data", onHandData);
      socket.off("connect_error", onError);
      socket.disconnect();
    };
  }, []);

  return { hands, connected, error, scaling };
}
