import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface WebSocketContextProps {
  socket: WebSocket | null;
  sendMessage: (data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextProps | undefined>(
  undefined,
);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const isConnectedRef = useRef(false);

  const sendMessage = (data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token"); // Adjust as per your auth flow
    if (!token || isConnectedRef.current) return;

    const ws = new WebSocket("ws://localhost:8080/ws"); // ✅ Correct port for WebSocket server

    ws.onopen = () => {
      console.log("🟢 WebSocket connected");
      isConnectedRef.current = true;
      ws.send(JSON.stringify({ type: "auth", payload: { token } }));
    };

    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);

      if (type === "new_message") {
        // Emit custom event for global handling
        window.dispatchEvent(
          new CustomEvent("socket:new_message", { detail: payload }),
        );
      }

      if (type === "typing") {
        window.dispatchEvent(
          new CustomEvent("socket:typing", { detail: payload }),
        );
      }
    };

    ws.onclose = () => {
      console.warn("🔌 WebSocket disconnected");
      isConnectedRef.current = false;
    };

    ws.onerror = (err) => {
      console.error("🚨 WebSocket error:", err);
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ socket, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context)
    throw new Error("useWebSocket must be used within WebSocketProvider");
  return context;
};
