"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { login } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Workflow, ShieldCheck, ArrowRight, Lock, Key } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { setToken, isLoggedIn, isInitialized } = useAuthStore();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await login(clientId, clientSecret);
      setToken(res.data.access_token);
      router.push("/dashboard");
    } catch {
      setError("Login gagal. Periksa kembali credentials Anda.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isInitialized && isLoggedIn) {
      router.push("/dashboard");
    }
  }, [isInitialized, isLoggedIn, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas-dots p-4">
      <Card className="w-full max-w-md rounded-3xl border border-border bg-card/90 backdrop-blur-md shadow-xl p-2">
        <CardHeader className="text-center pb-4 pt-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/25">
            <Workflow className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Dynamic Drools Console
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Masuk dengan OAuth2 Client Credentials untuk mengakses Flow Builder
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientId" className="text-xs font-semibold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                Client ID
              </Label>
              <Input
                id="clientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="cth: admin-client"
                className="h-10 text-xs font-mono rounded-xl bg-muted/20"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secret" className="text-xs font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                Client Secret
              </Label>
              <Input
                id="secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••••••"
                className="h-10 text-xs font-mono rounded-xl bg-muted/20"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20 gap-2 mt-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Flow Builder</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-border/60 text-center">
            <span className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Drools Rule Publishing & Evaluation Engine</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
