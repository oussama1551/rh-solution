import { MessageSquare, Plus, Search, Send, UserPlus, Users, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ChatConversation, ChatMessage, ChatUser } from "../lib/types";
import { useApi } from "../lib/useApi";

export function MessagesPage() {
  const { user } = useAuth();
  const conversations = useApi<ChatConversation[]>("/api/chat/conversations", []);
  const users = useApi<ChatUser[]>("/api/chat/users", []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [directUserId, setDirectUserId] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupUserIds, setGroupUserIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const selected = useMemo(
    () => conversations.data.find(conversation => conversation.id === selectedId) || conversations.data[0] || null,
    [conversations.data, selectedId]
  );
  const messages = useApi<ChatMessage[]>(selected ? `/api/chat/conversations/${selected.id}/messages` : null, []);
  const selectedGroupUsers = useMemo(
    () => users.data.filter(item => groupUserIds.includes(item.id)),
    [groupUserIds, users.data]
  );
  const availableGroupUsers = useMemo(() => {
    const search = groupSearch.trim().toLowerCase();
    return users.data.filter(item => {
      const label = `${item.fullName || ""} ${item.username}`.toLowerCase();
      return !search || label.includes(search);
    });
  }, [groupSearch, users.data]);

  useEffect(() => {
    if (!selectedId && conversations.data[0]) setSelectedId(conversations.data[0].id);
  }, [conversations.data, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      conversations.reload();
      messages.reload();
    }, 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    api(`/api/chat/conversations/${selected.id}/read`, { method: "PATCH" }).catch(() => undefined);
  }, [selected?.id]);

  async function createDirect(event: FormEvent) {
    event.preventDefault();
    if (!directUserId) return;
    const conversation = await api<ChatConversation>("/api/chat/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ userId: directUserId })
    });
    setSelectedId(conversation.id);
    setDirectUserId("");
    setMessage("Conversation ouverte.");
    conversations.reload();
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupTitle.trim() || !groupUserIds.length) return;
    const conversation = await api<ChatConversation>("/api/chat/conversations/group", {
      method: "POST",
      body: JSON.stringify({ name: groupTitle.trim(), userIds: groupUserIds })
    });
    setSelectedId(conversation.id);
    setGroupTitle("");
    setGroupUserIds([]);
    setGroupSearch("");
    setMessage("Groupe de discussion créé.");
    conversations.reload();
  }

  function toggleGroupUser(userId: string) {
    setGroupUserIds(current => current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !content.trim()) return;
    await api<ChatMessage>(`/api/chat/conversations/${selected.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: content.trim() })
    });
    setContent("");
    messages.reload();
    conversations.reload();
  }

  return (
    <>
      <PageHeader title="Messages" />
      {message && <div className="alert alert-success">{message}</div>}
      <div className="messages-layout">
        <aside className="messages-sidebar">
          <form className="message-create" onSubmit={createDirect}>
            <label>Nouvelle conversation</label>
            <div className="inline-form">
              <select value={directUserId} onChange={event => setDirectUserId(event.target.value)}>
                <option value="">Utilisateur...</option>
                {users.data.map(item => (
                  <option key={item.id} value={item.id}>{item.fullName || item.username}</option>
                ))}
              </select>
              <Button><Plus size={15} /></Button>
            </div>
          </form>
          <form className="message-create" onSubmit={createGroup}>
            <div className="message-create-header">
              <label>Créer un groupe</label>
              <span>{groupUserIds.length} destinataire(s)</span>
            </div>
            <input value={groupTitle} onChange={event => setGroupTitle(event.target.value)} placeholder="Nom du groupe, ex: RH Atelier charge" />
            <div className="input-icon">
              <Search size={15} />
              <input value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="Rechercher un utilisateur à ajouter..." />
            </div>
            <div className="recipient-picker" aria-label="Utilisateurs disponibles">
              {availableGroupUsers.map(item => {
                const checked = groupUserIds.includes(item.id);
                return (
                  <button type="button" key={item.id} className={`recipient-option ${checked ? "selected" : ""}`} onClick={() => toggleGroupUser(item.id)}>
                    <span className="recipient-check">{checked ? "OK" : "+"}</span>
                    <span>
                      <strong>{item.fullName || item.username}</strong>
                      <small>{item.username}</small>
                    </span>
                  </button>
                );
              })}
              {!availableGroupUsers.length && <div className="muted padded">Aucun utilisateur trouvé.</div>}
            </div>
            <div className="selected-recipients">
              <span className="recipient-note"><UserPlus size={14} /> Vous êtes ajouté automatiquement au groupe.</span>
              {selectedGroupUsers.length ? (
                <div className="recipient-chip-list">
                  {selectedGroupUsers.map(item => (
                    <button type="button" key={item.id} className="recipient-chip" onClick={() => toggleGroupUser(item.id)} title="Retirer">
                      {item.fullName || item.username}
                      <X size={13} />
                    </button>
                  ))}
                </div>
              ) : (
                <span className="muted">Choisissez au moins un destinataire.</span>
              )}
            </div>
            <Button variant="secondary" disabled={!groupTitle.trim() || !groupUserIds.length}>
              <Users size={15} /> Créer groupe pour {groupUserIds.length} destinataire(s)
            </Button>
          </form>
          <div className="conversation-list">
            {conversations.loading && <div className="muted padded">Chargement...</div>}
            {!conversations.loading && conversations.data.length === 0 && <div className="muted padded">Aucune conversation.</div>}
            {conversations.data.map(conversation => (
              <button key={conversation.id} className={`conversation-item ${conversation.id === selected?.id ? "active" : ""}`} onClick={() => setSelectedId(conversation.id)}>
                <strong>{conversationTitle(conversation, user?.id)}</strong>
                <small>{conversation.lastMessage?.content || "Aucun message"}</small>
                {conversation.unreadCount > 0 && <span className="nav-badge">{conversation.unreadCount}</span>}
              </button>
            ))}
          </div>
        </aside>
        <section className="messages-panel">
          {selected ? (
            <>
              <header className="messages-header">
                <MessageSquare size={18} />
                <div>
                  <strong>{conversationTitle(selected, user?.id)}</strong>
                  <small>{selected.participants.length} participant(s): {selected.participants.map(participant => participant.fullName || participant.username).join(", ")}</small>
                </div>
              </header>
              <div className="message-thread">
                {messages.loading && <div className="muted padded">Chargement...</div>}
                {messages.data.map(item => (
                  <div key={item.id} className={`message-bubble ${item.senderId === user?.id ? "mine" : ""}`}>
                    <strong>{item.sender.fullName || item.sender.username}</strong>
                    <p>{item.content}</p>
                    <small>{new Date(item.createdAt).toLocaleString("fr-FR")}</small>
                  </div>
                ))}
              </div>
              <form className="message-composer" onSubmit={send}>
                <input value={content} onChange={event => setContent(event.target.value)} placeholder="Écrire une note..." />
                <Button disabled={!content.trim()}><Send size={15} /> Envoyer</Button>
              </form>
            </>
          ) : (
            <div className="empty-state">Sélectionnez une conversation.</div>
          )}
        </section>
      </div>
    </>
  );
}

function conversationTitle(conversation: ChatConversation, currentUserId?: string) {
  if (conversation.name) return conversation.name;
  const other = conversation.participants.find(participant => participant.id !== currentUserId);
  return other?.fullName || other?.username || "Conversation";
}
