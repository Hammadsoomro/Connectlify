import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

interface SocketMessage {
  type: string;
  payload: any;
}

class SocketIOManager {
  private io: SocketIOServer | null = null;
  private authenticatedSockets: Map<string, AuthenticatedSocket[]> = new Map();

  initialize(server: any) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      path: "/socket.io/"
    });

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log("New Socket.IO connection:", socket.id);

      socket.on("auth", async (data) => {
        await this.handleAuthentication(socket, data);
      });

      socket.on("join_conversation", (data) => {
        this.handleJoinConversation(socket, data);
      });

      socket.on("leave_conversation", (data) => {
        this.handleLeaveConversation(socket, data);
      });

      socket.on("typing", (data) => {
        this.handleTyping(socket, data);
      });

      socket.on("disconnect", () => {
        this.removeClient(socket);
        console.log("Socket.IO connection closed:", socket.id);
      });

      socket.on("error", (error) => {
        console.error("Socket.IO error:", error);
        this.removeClient(socket);
      });
    });

    console.log("Socket.IO server initialized");
  }

  private async handleAuthentication(socket: AuthenticatedSocket, payload: any) {
    try {
      const { token } = payload;

      if (!token) {
        socket.emit("auth_error", { message: "Authentication token required" });
        return;
      }

      const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      const user = await User.findById(decoded.userId);
      if (!user) {
        socket.emit("auth_error", { message: "User not found" });
        return;
      }

      socket.userId = user._id.toString();
      socket.user = user;

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);
      
      this.addClient(socket);

      socket.emit("auth_success", {
        userId: user._id,
        message: "Authentication successful",
      });

      console.log(`User ${user.email} authenticated via Socket.IO`);
    } catch (error) {
      console.error("Socket.IO authentication error:", error);
      socket.emit("auth_error", { message: "Authentication failed" });
    }
  }

  private handleJoinConversation(socket: AuthenticatedSocket, payload: any) {
    const { conversationId } = payload;
    socket.join(`conversation_${conversationId}`);
    console.log(`User ${socket.userId} joined conversation ${conversationId}`);
  }

  private handleLeaveConversation(socket: AuthenticatedSocket, payload: any) {
    const { conversationId } = payload;
    socket.leave(`conversation_${conversationId}`);
    console.log(`User ${socket.userId} left conversation ${conversationId}`);
  }

  private handleTyping(socket: AuthenticatedSocket, payload: any) {
    const { contactId, isTyping } = payload;
    
    // Broadcast typing status to the contact's room
    socket.to(`user_${contactId}`).emit("typing", {
      contactId: socket.userId,
      isTyping,
    });
  }

  private addClient(socket: AuthenticatedSocket) {
    if (!socket.userId) return;

    if (!this.authenticatedSockets.has(socket.userId)) {
      this.authenticatedSockets.set(socket.userId, []);
    }

    this.authenticatedSockets.get(socket.userId)!.push(socket);
  }

  private removeClient(socket: AuthenticatedSocket) {
    if (!socket.userId) return;

    const userSockets = this.authenticatedSockets.get(socket.userId);
    if (userSockets) {
      const index = userSockets.indexOf(socket);
      if (index > -1) {
        userSockets.splice(index, 1);
      }

      if (userSockets.length === 0) {
        this.authenticatedSockets.delete(socket.userId);
      }
    }
  }

  // Public methods for broadcasting messages
  public notifyNewMessage(recipientUserId: string, contactId: string, message: any) {
    if (this.io) {
      this.io.to(`user_${recipientUserId}`).emit("new_message", {
        contactId,
        message,
      });
      
      // Also emit unread badge update
      this.io.to(`user_${recipientUserId}`).emit("unread_update", {
        contactId,
        hasUnread: true,
      });
    }
  }

  public notifyMessageStatus(recipientUserId: string, messageId: string, status: string) {
    if (this.io) {
      this.io.to(`user_${recipientUserId}`).emit("message_status", {
        messageId,
        status,
      });
    }
  }

  public notifyContactStatus(recipientUserId: string, contactId: string, isOnline: boolean) {
    if (this.io) {
      this.io.to(`user_${recipientUserId}`).emit("contact_status", {
        contactId,
        isOnline,
      });
    }
  }

  public broadcastToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user_${userId}`).emit(event, data);
    }
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.authenticatedSockets.keys());
  }

  public isUserConnected(userId: string): boolean {
    return this.authenticatedSockets.has(userId);
  }
}

// Singleton instance
export const socketIOManager = new SocketIOManager();
export default socketIOManager;