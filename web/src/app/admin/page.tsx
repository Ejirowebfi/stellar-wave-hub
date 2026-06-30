"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ON_CHAIN_ENABLED,
  explorerTxUrl,
  getRatingFee,
  getRegistrationFee,
  getContractVersion,
  getWasmVersion,
  getContractAdmin,
  getTreasuryBalance,
  setRatingFeeOnChain,
  setRegistrationFeeOnChain,
  setTreasuryOnChain,
  withdrawFeesOnChain,
  registerProjectOnChain,
  removeProjectOnChain,
  upgradeVersionOnChain,
  transferAdminOnChain,
} from "@/lib/ratingContract";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  status: string;
  featured: number;
  username: string;
  stellar_account_id?: string;
  stellar_network?: string;
  website_url?: string;
  github_url?: string;
  github_repos?: { label: string; url: string }[];
  avg_rating?: number;
  rating_count?: number;
  rejection_reason?: string;
  research_images?: string[];
  created_at: string;
}

// ─── Fetch helpers ──────────────────────────────────────────────────

function useAdminProjects(status: string | null, token: string | null) {
  return useQuery<Project[]>({
    queryKey: ["admin-projects", status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : "";
      const res = await fetch(`/api/admin/projects${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      return data.projects || [];
    },
    enabled: !!token,
  });
}

function usePendingProjects(token: string | null) {
  return useQuery<Project[]>({
    queryKey: ["admin-projects", "submitted"],
    queryFn: async () => {
      const res = await fetch("/api/projects/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      return data.projects || [];
    },
    enabled: !!token,
  });
}

// ─── Action hooks ───────────────────────────────────────────────────

function useProjectAction(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      action,
      body,
    }: {
      projectId: number;
      action: string;
      body?: Record<string, unknown>;
    }) => {
      const method = action === "delete" ? "DELETE" : "PUT";
      const res = await fetch(`/api/projects/${projectId}/${action}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body || {}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Action failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-projects"] });
    },
  });
}

// ─── Promo Codes ────────────────────────────────────────────────────

interface PromoCode {
  id: number;
  code: string;
  percent_off: number;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

function useAdminPromoCodes(token: string | null) {
  return useQuery<PromoCode[]>({
    queryKey: ["admin-promo-codes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promo-codes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch promo codes");
      const data = await res.json();
      return data.promoCodes || [];
    },
    enabled: !!token,
  });
}

function PromoCodesTab({ token }: { token: string | null }) {
  const qc = useQueryClient();
  const { data: promos = [], isLoading } = useAdminPromoCodes(token);
  
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          percent_off: Number(percentOff),
          max_uses: maxUses ? Number(maxUses) : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create promo code");
      }
      setCode("");
      setPercentOff("");
      setMaxUses("");
      setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["admin-promo-codes"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating code");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deletePromo = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this promo code?")) return;
    try {
      const res = await fetch(`/api/admin/promo-codes?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete promo code");
      qc.invalidateQueries({ queryKey: ["admin-promo-codes"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting code");
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6">
        <h3 className="font-semibold text-starlight mb-4">Create Promo Code</h3>
        <form onSubmit={createPromo} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="text-xs text-ash mb-1 block">Code *</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="input-field w-full text-sm font-mono"
              placeholder="e.g. HALFOFF"
            />
          </div>
          <div>
            <label className="text-xs text-ash mb-1 block">% Off *</label>
            <input
              type="number"
              required
              min="1"
              max="100"
              value={percentOff}
              onChange={(e) => setPercentOff(e.target.value)}
              className="input-field w-full text-sm"
              placeholder="e.g. 50"
            />
          </div>
          <div>
            <label className="text-xs text-ash mb-1 block">Max Uses (optional)</label>
            <input
              type="number"
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="input-field w-full text-sm"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="text-xs text-ash mb-1 block">Expires (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input-field w-full text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !code || !percentOff}
            className="btn-nova text-sm w-full h-[42px] disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create"}
          </button>
        </form>
        {error && <p className="text-supernova text-xs mt-3">{error}</p>}
      </div>

      <div className="glass rounded-2xl p-6">
        <h3 className="font-semibold text-starlight mb-4">Active Promo Codes</h3>
        {isLoading ? (
          <Skeletons count={2} />
        ) : promos.length > 0 ? (
          <div className="space-y-3">
            {promos.map((promo) => (
              <div
                key={promo.id}
                className="bg-stardust/30 border border-dust/20 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap hover:border-dust/40 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-plasma-bright text-lg">
                      {promo.code}
                    </span>
                    <span className="tag tag-solar text-xs font-semibold">
                      {promo.percent_off}% OFF
                    </span>
                    {promo.expires_at && new Date(promo.expires_at) < new Date() && (
                      <span className="tag tag-supernova text-xs">Expired</span>
                    )}
                    {promo.max_uses && promo.uses >= promo.max_uses && (
                      <span className="tag tag-supernova text-xs">Depleted</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ash">
                    <span>
                      Uses: <span className="text-moonlight">{promo.uses}</span>
                      {promo.max_uses ? ` / ${promo.max_uses}` : " (Unlimited)"}
                    </span>
                    {promo.expires_at && (
                      <span>
                        Expires: <span className="text-moonlight">{new Date(promo.expires_at).toLocaleDateString()} {new Date(promo.expires_at).toLocaleTimeString()}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deletePromo(promo.id)}
                  className="bg-supernova/10 hover:bg-supernova/20 text-supernova border border-supernova/20 text-xs px-4 py-2 rounded-lg transition-all font-medium shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-ash text-sm">No promo codes created yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reject Dialog ──────────────────────────────────────────────────
// ... [Keep existing RejectDialog, DelistDialog, DeleteDialog, StatusBadge, PendingCard, ProjectRow, EmptyState, Skeletons, ContractPanel unaltered] ...

function filterProjects(projects: Project[], query: string): Project[] {
  if (!query.trim()) return projects;
  const q = query.toLowerCase();
  return projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
  );
}

export default function AdminPage() {
  const { user, token } = useAuth();
  const action = useProjectAction(token);
  const [search, setSearch] = useState("");

  const { data: pending = [], isLoading: pendingLoading } = usePendingProjects(token);
  const { data: approved = [], isLoading: approvedLoading } = useAdminProjects("approved", token);
  const { data: featured = [], isLoading: featuredLoading } = useAdminProjects("featured", token);
  const { data: all = [], isLoading: allLoading } = useAdminProjects(null, token);

  const filteredPending = filterProjects(pending, search);
  const filteredApproved = filterProjects(approved, search);
  const filteredFeatured = filterProjects(featured, search);
  const filteredAll = filterProjects(all, search);

  if (!user || user.role !== "admin") {
    // ... [Keep existing not admin state]
  }

  const rejectedCount = filteredAll.filter((p) => p.status === "rejected" || p.status === "delisted").length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* ... [Keep existing Header, Search, Stats Grid, and Feedback] */}
      
      {/* Tabs */}
      <div className="animate-in animate-in-delay-3">
        <Tabs defaultValue="pending">
          <TabsList className="flex-wrap">
            <TabsTrigger value="pending">
              Pending
              {filteredPending.length > 0 && (
                <span className="ml-2 bg-solar/20 text-solar-bright text-xs px-2 py-0.5 rounded-md">
                  {filteredPending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="featured">Featured</TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected / Delisted
              {rejectedCount > 0 && (
                <span className="ml-2 bg-supernova/15 text-supernova/80 text-xs px-2 py-0.5 rounded-md">
                  {rejectedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All Projects</TabsTrigger>
            <TabsTrigger value="contract">
              Contract
              {ON_CHAIN_ENABLED && (
                <span className="ml-2 bg-plasma/15 text-plasma-bright text-xs px-2 py-0.5 rounded-md">
                  on-chain
                </span>
              )}
            </TabsTrigger>
            {/* NEW TABS TRIGGER FOR PROMO CODES */}
            <TabsTrigger value="promos">Promo Codes</TabsTrigger>
          </TabsList>

          {/* ... [Keep existing TabsContent mappings for pending, approved, featured, rejected, all, contract] */}

          {/* NEW TABS CONTENT FOR PROMO CODES */}
          <TabsContent value="promos">
            <PromoCodesTab token={token} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}