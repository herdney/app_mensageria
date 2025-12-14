import { MessageSquare, QrCode, Bot, User, Search, MessageSquarePlus, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "./ui/button";
import { Separator } from "./ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Input } from "./ui/input";
import { useState } from "react";
import { NewChatDialog } from "./NewChatDialog";
import { cn } from "./ui/utils";

type Contact = {
  id: string;
  name: string;
  phoneNumber?: string;
  lastMessage: string;
  time: string;
  avatar?: string;
};

type SidebarProps = {
  activeView: "contacts" | "connection" | "agent";
  onViewChange: (view: "contacts" | "connection" | "agent") => void;
  contacts: Contact[];
  onContactClick?: (contactId: string) => void;
  onStartNewChat?: (phoneNumber: string, message: string) => Promise<void>;
  onRefresh?: () => void;
  hasConnections: boolean;
};

export function Sidebar({ activeView, onViewChange, contacts, onContactClick, onStartNewChat, hasConnections, onRefresh }: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contact.phoneNumber && contact.phoneNumber.includes(searchTerm))
  );

  return (
    <div className="w-80 border-r bg-background flex flex-col h-screen">
      <NewChatDialog
        open={isNewChatOpen}
        onOpenChange={setIsNewChatOpen}
        onSend={async (phone, msg) => {
          if (onStartNewChat) {
            await onStartNewChat(phone, msg);
          }
        }}
      />

      {/* Logo/Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" />
          <h1>Mensageria</h1>
        </div>
      </div>

      {/* Menu Items */}
      <div className="p-2 border-b">
        <div className="space-y-1">
          <Button
            variant={activeView === "connection" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onViewChange("connection")}
          >
            <QrCode className="w-4 h-4 mr-2" />
            Conexão
          </Button>
          <Button
            variant={activeView === "agent" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => hasConnections && onViewChange("agent")}
            disabled={!hasConnections}
          >
            <Bot className="w-4 h-4 mr-2" />
            Agente
          </Button>
          <div
            className={cn(
              buttonVariants({ variant: activeView === "contacts" ? "secondary" : "ghost" }),
              "w-full justify-start cursor-pointer group",
              !hasConnections && "opacity-50 pointer-events-none"
            )}
            onClick={() => hasConnections && onViewChange("contacts")}
            aria-disabled={!hasConnections}
          >
            <MessageSquare className="w-4 h-4 mr-2 pointer-events-none" />
            Contatos
            <div
              role="button"
              className="ml-auto p-1 hover:bg-background/80 rounded-sm z-10"
              onClick={(e) => {
                e.stopPropagation();
                if (hasConnections) setIsNewChatOpen(true);
              }}
            >
              <MessageSquarePlus className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Contacts List with Search */}
      {activeView === "contacts" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-3 pb-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar contato..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={onRefresh} title="Atualizar lista">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-2">
              {filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? (
                    <p>Nenhum contato encontrado</p>
                  ) : (
                    <>
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhum contato ainda</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => onContactClick?.(contact.id)}
                      className="w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10">
                          {contact.avatar && <AvatarImage src={contact.avatar} alt={contact.name} />}
                          <AvatarFallback>
                            <User className="w-5 h-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="truncate">{contact.name}</span>
                            <span className="text-xs text-muted-foreground">{contact.time}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {contact.lastMessage}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
