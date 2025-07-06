import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SMSNavbar from "@/components/SMSNavbar";
import ContactList, { Contact } from "@/components/ContactList";
import ChatArea, { Message } from "@/components/ChatArea";
import ApiService from "@/services/api";
import { Badge } from "@/components/ui/badge";


export default function Conversations() {
  const navigate = useNavigate();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [activePhoneNumber, setActivePhoneNumber] = useState<string | null>(
    null,
  );
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    avatar: "",
    role: "admin",
  });

  // 🟢 Load profile, contacts, numbers on first load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [userProfile, contactsData, phoneNumbersData] = await Promise.all(
          [
            ApiService.getProfile(),
            ApiService.getContacts(),
            ApiService.getPhoneNumbers(),
          ],
        );

        setProfile(userProfile);
        setContacts(contactsData);
        setPhoneNumbers(phoneNumbersData);

        const active = phoneNumbersData.find((p: any) => p.isActive);
        if (active) {
          setActivePhoneNumber(active.id);
        } else if (phoneNumbersData.length > 0) {
          const fallback = phoneNumbersData[0];
          setActivePhoneNumber(fallback.id);
          await ApiService.setActiveNumber(fallback.id);
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
      }
    };

    loadInitialData();
  }, []);

  // 📩 Load messages + reset unread when contact selected
  useEffect(() => {
    const loadMessages = async () => {
      if (selectedContactId) {
        try {
          const messagesData = await ApiService.getMessages(selectedContactId);
          setMessages(messagesData);
          await ApiService.markAsRead(selectedContactId);

          setContacts((prev) =>
            prev.map((c) =>
              c.id === selectedContactId ? { ...c, unreadCount: 0 } : c,
            ),
          );
        } catch (error) {
          console.error("Error loading messages:", error);
        }
      }
    };

    loadMessages();
  }, [selectedContactId]);

  // 🔔 WebSocket badge sync
  useEffect(() => {
    const handleIncomingMessage = (e: any) => {
      const { contactId, message } = e.detail;

      if (contactId === selectedContactId) {
        setMessages((prev) => [...prev, message]);
      } else {
        setContacts((prev) =>
          prev.map((contact) =>
            contact.id === contactId
              ? {
                  ...contact,
                  unreadCount: (contact.unreadCount || 0) + 1,
                  lastMessage: message.content,
                  lastMessageTime: new Date().toISOString(),
                }
              : contact,
          ),
        );
      }
    };

    window.addEventListener("socket:new_message", handleIncomingMessage);
    return () => {
      window.removeEventListener("socket:new_message", handleIncomingMessage);
    };
  }, [selectedContactId]);

  const handleSelectContact = (contactId: string) => {
    setSelectedContactId(contactId);
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedContactId || !activePhoneNumber || isLoading) return;

    const activeNumber = phoneNumbers.find((p) => p.id === activePhoneNumber);
    if (!activeNumber) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      timestamp: new Date().toISOString(),
      isOutgoing: true,
      status: "sending",
      type: "text",
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const sent = await ApiService.sendSMS(
        selectedContactId,
        content,
        activeNumber.number,
      );

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id
            ? { ...msg, id: sent.id, status: "sent" as const }
            : msg,
        ),
      );

      setContacts((prev) =>
        prev.map((contact) =>
          contact.id === selectedContactId
            ? {
                ...contact,
                lastMessage: content,
                lastMessageTime: new Date().toISOString(),
              }
            : contact,
        ),
      );
    } catch (error: any) {
      console.error("Send error:", error);
      let msg = "Failed to send message";

      if (error.message.includes("NO_PHONE_NUMBER")) {
        msg = "Please buy a phone number first";
      } else if (error.message.includes("NO_ASSIGNED_NUMBER")) {
        msg = "No number assigned. Ask admin.";
      } else if (error.message.includes("INVALID_NUMBER")) {
        msg = "Invalid number selected";
      } else if (error.message.includes("INSUFFICIENT_BALANCE")) {
        msg = "Wallet balance too low";
      }

      alert(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === newMessage.id ? { ...m, status: "failed" as const } : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectedContact =
    contacts.find((contact) => contact.id === selectedContactId) || null;

  const totalUnreadCount = contacts.reduce(
    (total, contact) => total + contact.unreadCount,
    0,
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <SMSNavbar
        unreadCount={totalUnreadCount}
        phoneNumbers={phoneNumbers}
        activeNumber={activePhoneNumber}
        profile={profile}
        onSelectNumber={async (id) => {
          try {
            await ApiService.setActiveNumber(id);
            setActivePhoneNumber(id);
            setPhoneNumbers((prev) =>
              prev.map((p) => ({ ...p, isActive: p.id === id })),
            );
          } catch (error) {
            console.error("Phone number selection error:", error);
          }
        }}
        onBuyNewNumber={() => navigate("/buy-numbers")}
        onUpdateProfile={async (profileUpdate) => {
          try {
            const updated = await ApiService.updateProfile(profileUpdate);
            setProfile(updated);
          } catch (e) {
            console.error("Profile update failed", e);
          }
        }}
        onLogout={() => {
          ApiService.logout();
          navigate("/");
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        <ContactList
          contacts={contacts}
          selectedContactId={selectedContactId}
          onSelectContact={handleSelectContact}
          onAddContact={async (name, phone) => {
            try {
              const newC = await ApiService.addContact(name, phone);
              setContacts((prev) => [newC, ...prev]);
            } catch (e) {
              console.error("Add contact failed", e);
            }
          }}
          onEditContact={(id) => console.log("Edit:", id)}
          onDeleteContact={async (id) => {
            try {
              await ApiService.deleteContact(id);
              setContacts((prev) => prev.filter((c) => c.id !== id));
              if (selectedContactId === id) setSelectedContactId(null);
            } catch (e) {
              console.error("Delete contact failed", e);
            }
          }}
        />

        <ChatArea
          selectedContact={selectedContact}
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
