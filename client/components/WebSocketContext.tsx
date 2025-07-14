import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextProps {
  socket: Socket | null;
  isConnected: boolean;
  sendMessage: (event: string, data: any) => void;
}

const SocketContext = createContext<SocketContextProps | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false);

  const sendMessage = (event: string, data: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || isConnectedRef.current) return;

    // Initialize Socket.IO client
    const socketInstance = io("http://localhost:8080", {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socketInstance.on("connect", () => {
      console.log("🟢 Socket.IO connected");
      setIsConnected(true);
      isConnectedRef.current = true;
      
      // Authenticate immediately after connection
      socketInstance.emit("auth", { token });
    });

    socketInstance.on("auth_success", (data) => {
      console.log("✅ Socket.IO authentication successful:", data);
    });

    socketInstance.on("auth_error", (error) => {
      console.error("❌ Socket.IO authentication failed:", error);
    });

    socketInstance.on("new_message", (data) => {
      console.log("📨 New message received:", data);
      // Emit custom event for global handling
      window.dispatchEvent(
        new CustomEvent("socket:new_message", { detail: data })
      );
    });

    socketInstance.on("unread_update", (data) => {
      console.log("🔔 Unread badge update:", data);
      window.dispatchEvent(
        new CustomEvent("socket:unread_update", { detail: data })
      );
    });

    socketInstance.on("typing", (data) => {
      window.dispatchEvent(
        new CustomEvent("socket:typing", { detail: data })
      );
    });

    socketInstance.on("contact_status", (data) => {
      window.dispatchEvent(
        new CustomEvent("socket:contact_status", { detail: data })
      );
    });

    socketInstance.on("message_status", (data) => {
      window.dispatchEvent(
        new CustomEvent("socket:message_status", { detail: data })
      );
    });

    socketInstance.on("disconnect", () => {
      console.warn("🔌 Socket.IO disconnected");
      setIsConnected(false);
      isConnectedRef.current = false;
    });

    socketInstance.on("connect_error", (error) => {
      console.error("🚨 Socket.IO connection error:", error);
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setIsConnected(false);
      isConnectedRef.current = false;
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, sendMessage }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};

// Keep the old export for backward compatibility
export const useWebSocket = useSocket;
export const WebSocketProvider = SocketProvider;