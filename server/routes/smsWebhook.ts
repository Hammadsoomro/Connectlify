import express from "express";
import Contact from "../models/Contact"; // ✅ Your Contact model
import Message from "../models/Message"; // ✅ Your Message model
import webSocketManager from "../websocket"; // ✅ Import WebSocketManager

const router = express.Router();

router.post("/twilio-sms", async (req, res) => {
  const { From, Body } = req.body;

  try {
    // 🧠 Step 1: Find contact from DB using incoming number
    const contact = await Contact.findOne({ phoneNumber: From });

    if (!contact) {
      console.warn("🚫 Unknown contact:", From);
      return res.send("<Response></Response>");
    }

    // 🧠 Step 2: Save message to DB (optional but recommended)
    const newMessage = await Message.create({
      userId: contact.userId,
      contactId: contact._id,
      content: Body,
      isOutgoing: false,
      status: "delivered",
      fromNumber: From,
      toNumber: contact.linkedNumber, // 📌 if you store user's number on contact
      type: "text",
    });

    // 🧠 Step 3: Send to frontend via WebSocket
    webSocketManager.notifyNewMessage(
      contact.userId.toString(), // 🎯 This is the logged-in user receiving SMS
      contact._id.toString(),
      {
        id: newMessage._id.toString(),
        content: Body,
        timestamp: newMessage.createdAt,
        isOutgoing: false,
        status: "delivered",
        type: "text",
        fromNumber: From,
        toNumber: newMessage.toNumber,
      },
    );

    // ✅ Respond to Twilio with empty XML
    res.send("<Response></Response>");
  } catch (err) {
    console.error("❌ SMS webhook error:", err);
    res.status(500).send("<Response></Response>");
  }
});

export default router;
