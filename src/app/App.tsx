import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/ui/sonner";
import { ConnectionView } from "./components/ConnectionView";
import { AgentView } from "./components/AgentView";
import { ContactsView } from "./components/ContactsView";

type Contact = {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
};

export default function App() {
  const [activeView, setActiveView] = useState<"contacts" | "connection" | "agent">("contacts");

  // Mock contacts data
  const [contacts] = useState<Contact[]>([
    {
      id: "1",
      name: "João Silva",
      lastMessage: "Obrigado pelo atendimento!",
      time: "10:45",
    },
    {
      id: "2",
      name: "Maria Santos",
      lastMessage: "Quando posso retirar?",
      time: "09:30",
    },
    {
      id: "3",
      name: "Pedro Costa",
      lastMessage: "Perfeito, até logo!",
      time: "Ontem",
    },
  ]);

  const handleContactClick = (contactId: string) => {
    console.log("Contact clicked:", contactId);
    // Aqui você pode implementar a lógica para abrir a conversa
  };

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        contacts={contacts}
        onContactClick={handleContactClick}
      />

      <main className="flex-1">
        {activeView === "contacts" && <ContactsView />}
        {activeView === "connection" && <ConnectionView />}
        {activeView === "agent" && <AgentView />}
      </main>
      <Toaster />
    </div>
  );
}
