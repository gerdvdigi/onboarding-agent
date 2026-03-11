"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { Plus, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { getApiBaseUrl, getAuthFetchOptions } from "@/lib/config/api";

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

interface ConversationsDashboardProps {
  /** When provided, skips initial client fetch (data came from server) */
  initialConversations?: Conversation[];
}

export function ConversationsDashboard({
  initialConversations,
}: ConversationsDashboardProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const hasInitialData = initialConversations !== undefined;
  const [conversations, setConversations] = useState<Conversation[]>(
    initialConversations ?? []
  );
  const [loading, setLoading] = useState(!hasInitialData);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newConversationName, setNewConversationName] = useState("");
  const [conversationToDelete, setConversationToDelete] =
    useState<Conversation | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const opts = await getAuthFetchOptions(getToken);
      const res = await fetch(`${getApiBaseUrl()}/onboarding/conversations`, {
        ...opts,
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      } else {
        toast.error("Could not load conversations");
        setConversations([]);
      }
    } catch {
      toast.error("Error loading conversations");
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (hasInitialData) {
      setLoading(false);
      return;
    }
    fetchConversations();
  }, [fetchConversations, hasInitialData]);

  const openCreateModal = () => {
    setNewConversationName("");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewConversationName("");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const opts = await getAuthFetchOptions(getToken);
      const res = await fetch(`${getApiBaseUrl()}/onboarding/conversations`, {
        method: "POST",
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers as Record<string, string>),
        },
        body: JSON.stringify({
          title: newConversationName.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Conversation created");
        closeCreateModal();
        router.push(`/onboarding/conversations/${data.id}`);
      } else {
        toast.error("Could not create conversation");
      }
    } catch {
      toast.error("Error creating conversation");
    } finally {
      setCreating(false);
    }
  };

  const openDeleteModal = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    e.stopPropagation();
    setConversationToDelete(conv);
  };

  const closeDeleteModal = () => {
    if (!deletingId) setConversationToDelete(null);
  };

  const handleDelete = async () => {
    if (!conversationToDelete || deletingId) return;
    const id = conversationToDelete.id;
    setDeletingId(id);
    try {
      const opts = await getAuthFetchOptions(getToken);
      const res = await fetch(
        `${getApiBaseUrl()}/onboarding/conversations/${id}`,
        {
          method: "DELETE",
          ...opts,
        }
      );
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setConversationToDelete(null);
        toast.success("Conversation deleted");
      } else {
        toast.error("Could not delete conversation");
      }
    } catch {
      toast.error("Error deleting conversation");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-heading">
          Conversations
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage your discovery conversations. Create new ones or continue an
          existing one.
        </p>
      </section>

      <div className="mb-6 flex justify-end">
        <Button onClick={openCreateModal} disabled={creating}>
          {creating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          New conversation
        </Button>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">
            You don't have any conversations yet. Create one to start
            discovery.
          </p>
          <Button
            onClick={openCreateModal}
            disabled={creating}
            className="mt-4"
          >
            {creating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            New conversation
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/onboarding/conversations/${conv.id}`)}
              onKeyDown={(e) =>
                e.key === "Enter" && router.push(`/onboarding/conversations/${conv.id}`)
              }
              className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-heading truncate">{conv.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(conv.createdAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => openDeleteModal(e, conv)}
                disabled={deletingId === conv.id}
                aria-label={`Delete ${conv.title}`}
              >
                {deletingId === conv.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) setNewConversationName("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Give your conversation a name to start discovery.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="conversation-name">Name</Label>
              <Input
                id="conversation-name"
                placeholder="e.g. Project Alpha, Q1 Planning..."
                value={newConversationName}
                onChange={(e) => setNewConversationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeCreateModal}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={conversationToDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteModal();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;
              {conversationToDelete?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDeleteModal}
              disabled={!!deletingId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!!deletingId}
            >
              {deletingId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
