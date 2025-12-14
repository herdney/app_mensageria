import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { ConnectionView } from "./components/ConnectionView";
import { AgentView } from "./components/AgentView";
import { ContactsView } from "./components/ContactsView";
import { EvolutionApiService } from "./services/evolutionApi";
import { socket, connectSocket, disconnectSocket } from "./services/socket"; // Import socket service

type Contact = {
  id: string;
  name: string;
  phoneNumber: string;
  lastMessage: string;
  time: string;
  avatar?: string;
};

export default function App() {
  const [activeView, setActiveView] = useState<"contacts" | "connection" | "agent">("contacts");

  // Connection State (Lifted from ConnectionView)
  const [apiKey, setApiKey] = useState(localStorage.getItem("evolution_api_key") || "");
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem("evolution_base_url") || "");
  const [instances, setInstances] = useState<any[]>([]); // API Instances
  const [savedInstances, setSavedInstances] = useState<any[]>([]); // DB Instances
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem("evolution_base_url", baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    localStorage.setItem("evolution_api_key", apiKey);
  }, [apiKey]);

  // Socket.io Connection
  useEffect(() => {
    connectSocket();

    socket.on('connect', () => {
      console.log('Connected to WebSocket Server (ID:)', socket.id);
      toast.success("Conectado ao servidor em tempo real 🟢");
    });

    socket.on('evolution_event', (data: any) => {
      console.log('🔥 Real-time Event:', data);

      const eventType = (data.type || data.event || "").toUpperCase();


      if (['MESSAGES.UPSERT', 'MESSAGES_UPSERT', 'SEND.MESSAGE'].includes(eventType)) {
        const payload = data.data || data.payload;
        // Normalize messages to array
        const msgs = Array.isArray(payload?.messages) ? payload.messages : [payload].filter(Boolean);

        msgs.forEach((msg: any) => {
          if (!msg || !msg.key) return;

          const remoteJid = msg.key.remoteJid;
          const isGroup = remoteJid?.includes('@g.us');

          // Only handle private chats for now
          if (!isGroup && remoteJid) {
            setContacts(prev => {
              const existingIndex = prev.findIndex(c => c.id === remoteJid);
              const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || (msg.message?.imageMessage ? "[Imagem]" : "Nova mensagem");
              const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              const fromMe = msg.key?.fromMe;

              if (existingIndex > -1) {
                // Move to top and update
                const updated = [...prev];
                const [moved] = updated.splice(existingIndex, 1);
                moved.lastMessage = messageContent;
                moved.time = timestamp;
                return [moved, ...updated];
              } else {
                // Add new contact
                const initialName = (!fromMe && msg.pushName) ? msg.pushName : remoteJid.split('@')[0];

                const newContact: Contact = {
                  id: remoteJid,
                  name: initialName,
                  phoneNumber: remoteJid.split('@')[0],
                  lastMessage: messageContent,
                  time: timestamp
                };
                return [newContact, ...prev];
              }
            });

            // Should also update selectedContact if it matches
            setSelectedContact(prev => {
              if (prev && prev.id === remoteJid) {
                return { ...prev, lastMessage: (msg.message?.conversation || "Nova mensagem"), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              }
              return prev;
            });
          }
        });
      }
    });



    // Listen for enriched contact data (Name/Pic updates)
    socket.on('contact_update', (data: any) => {
      console.log('✨ Contact Enriched:', data);
      const { remoteJid, pushName, profilePicUrl } = data;

      setContacts(prev => prev.map(c => {
        if (c.id === remoteJid) {
          return {
            ...c,
            ...c,
            // If pushName is null/empty (enrichment failed or empty), revert to Number. 
            // Do NOT keep 'c.name' if it was potentially wrong (e.g. "Herd").
            // Exception: If we already had a valid name and enrichment returns null? 
            // Usually enrichment returns null if it found nothing. Correct behavior is to show Number.
            name: pushName || c.id.split('@')[0],
            avatar: profilePicUrl || c.avatar
          };
        }
        return c;
      }));

      // Update selected contact if currently viewing
      setSelectedContact(prev => {
        if (prev && prev.id === remoteJid) {
          return {
            ...prev,
            name: pushName || prev.name,
            avatar: profilePicUrl || prev.avatar
          };
        }
        return prev;
      });
    });

    socket.on('database_cleared', () => {
      setContacts([]);
      setSelectedContact(null);
      toast.info("Banco de dados limpo pelo servidor.");
    });

    return () => {
      socket.off('connect');
      socket.off('evolution_event');
      socket.off('contact_update');
      socket.off('database_cleared');
      disconnectSocket();
    };
  }, []);

  // Fetch Saved Hosts from DB
  const fetchSavedInstances = async () => {
    try {
      const res = await fetch('http://localhost:3001/hosts');
      if (res.ok) {
        const data = await res.json();
        setSavedInstances(data);

        // Auto-select based on current credentials if possible
        if (!selectedInstance && baseUrl && apiKey) {
          const match = data.find((h: any) => h.base_url === baseUrl && h.api_key === apiKey);
          if (match) setSelectedInstance(match);
        }
      }
    } catch (error) {
      console.error("Failed to fetch saved hosts:", error);
    }
  };

  useEffect(() => {
    fetchSavedInstances();
  }, []);

  // Fetch instances
  const fetchInstancesList = async () => {
    if (!baseUrl || !apiKey) return;
    try {
      const apiService = new EvolutionApiService(baseUrl, apiKey);
      const data = await apiService.fetchInstances();
      const instanceList = Array.isArray(data) ? data : [];

      // Fetch webhook for each instance
      const enriched = await Promise.all(instanceList.map(async (inst: any) => {
        try {
          const name = inst.instance?.instanceName || inst.name || inst.instanceName;
          if (name) {
            const wh = await apiService.findWebhook(name);
            if (wh && wh.url) {
              // Merge webhook url into instance object top level and instance level for safety
              return {
                ...inst,
                webhookUrl: wh.url,
                instance: { ...inst.instance, webhookUrl: wh.url }
              };
            }
          }
          return inst;
        } catch (err) {
          console.error("Failed to fetch webhook for", inst, err);
          return inst;
        }
      }));

      setInstances(enriched);

      // Auto-select first connected instance if none selected
      if (!selectedInstance && enriched.length > 0) {
        const connected = enriched.find((i: any) => i.instance?.status === 'open');
        if (connected) setSelectedInstance(connected);
      }
    } catch (e) {
      console.error("Failed to fetch instances", e);
    }
  };

  useEffect(() => {
    if (baseUrl && apiKey) {
      fetchInstancesList();
    } else {
      setInstances([]);
    }
  }, [baseUrl, apiKey]);

  // Handle Global Instance Selection
  const handleSelectInstance = (instanceName: string) => {
    const selected = savedInstances.find(i => i.name === instanceName);
    if (selected) {
      setSelectedInstance(selected);
      // Update active credentials
      setBaseUrl(selected.base_url);
      setApiKey(selected.api_key);
    }
  };



  // Contacts Management
  const [contacts, setContacts] = useState<Contact[]>([]);

  const fetchContacts = async () => {
    if (!baseUrl || !apiKey || !selectedInstance) return;
    try {
      const res = await fetch(`http://localhost:3001/contacts/${selectedInstance.name}`);
      const dbContacts = await res.json();

      let mapped: Contact[] = [];
      if (Array.isArray(dbContacts)) {
        mapped = dbContacts.map((c: any) => ({
          id: c.remote_jid,
          name: c.push_name || c.remote_jid.split('@')[0],
          phoneNumber: c.remote_jid.split('@')[0],
          lastMessage: c.last_message_content || "",
          time: c.last_message_created_at ? new Date(c.last_message_created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
          avatar: c.profile_pic_url
        }));
      }

      setContacts(mapped);
    } catch (e) {
      console.error("Failed to fetch contacts", e);
      toast.error("Erro ao buscar contatos locais");
    }
  };

  useEffect(() => {
    if (selectedInstance) {
      fetchContacts();
    } else {
      setContacts([]);
    }
  }, [selectedInstance]);

  const handleContactClick = (contactId: string) => {
    console.log("Contact clicked:", contactId);
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      setSelectedContact(contact);
    }
  };

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        contacts={contacts}
        onContactClick={handleContactClick}
        onStartNewChat={async (phoneNumber, message) => {
          if (!selectedInstance) {
            toast.error("Nenhuma instância selecionada");
            return;
          }
          try {
            const apiService = new EvolutionApiService(baseUrl, apiKey);
            await apiService.sendTextMessage(selectedInstance.name, phoneNumber, message);
            toast.success("Mensagem enviada!");
            // Refresh contacts to show new chat
            setTimeout(() => {
              fetchContacts();
            }, 1000);
          } catch (error) {
            console.error(error);
            toast.error("Erro ao enviar mensagem");
            // Refresh contacts to ensure UI sync with DB (removes invalid contacts)
            fetchContacts();
            throw error;
          }
        }}
        hasConnections={savedInstances.length > 0}
        onRefresh={fetchContacts}
      />

      <main className="flex-1">
        {activeView === "contacts" && (
          <ContactsView
            instances={savedInstances}
            selectedInstance={selectedInstance}
            onSelectInstance={(inst) => handleSelectInstance(inst?.name)} // Adapt to name string
            selectedContact={selectedContact}
            baseUrl={baseUrl}
            apiKey={apiKey}
          />
        )}
        {activeView === "connection" && (
          <ConnectionView
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            instances={instances}
            onRefreshInstances={fetchInstancesList}
            savedInstances={savedInstances} // Pass DB instances
            onRefreshSavedInstances={fetchSavedInstances} // Pass DB refresh
          />
        )}
        {activeView === "agent" && <AgentView />}
      </main>
      <Toaster />
    </div>
  );
}
