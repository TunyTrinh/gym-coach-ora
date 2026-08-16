import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { isPreviewDebugHost } from "@/lib/preview-debug";

type DebugAccount = { id: number; name: string | null; email: string | null; role: "client" | "coach" | "admin" };

function canShowPreviewDebug() {
  return typeof __DEV__ !== "undefined" && Platform.OS === "web" && typeof window !== "undefined" && isPreviewDebugHost(__DEV__, window.location.hostname);
}

export function PreviewAccountSwitcher({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const [accounts, setAccounts] = useState<DebugAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const previewHost = canShowPreviewDebug();

  const endpoint = useMemo(() => `${getApiBaseUrl()}/api/debug/accounts`, []);
  useEffect(() => {
    if (!previewHost || !user) return;
    let active = true;
    void fetch(endpoint, { credentials: "include" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { accounts?: DebugAccount[] };
      if (active) {
        setAccounts(payload.accounts ?? []);
        setEnabled(true);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [endpoint, previewHost, user]);

  const switchAccount = async (accountId: number) => {
    setBusy(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/debug/switch-account`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!response.ok) throw new Error("Unable to switch Preview account.");
      await refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!previewHost || !enabled) return <>{children}</>;
  return <>
    {children}
    <View style={styles.dock} pointerEvents="box-none">
      <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityLabel="Open Preview debug account switcher" style={styles.trigger}>
        <Text style={styles.triggerText}>Preview debug · {user?.role ?? "account"}</Text>
      </Pressable>
      {open ? <View style={styles.panel}>
        <Text style={styles.title}>Switch real account</Text>
        <Text style={styles.copy}>Uses the same database and API rules as the public PWA. Preview only.</Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {accounts.map((account) => <Pressable key={account.id} disabled={busy} onPress={() => void switchAccount(account.id)} style={({ pressed }) => [styles.account, account.id === user?.id && styles.activeAccount, (pressed || busy) && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Switch to ${account.name ?? account.email ?? "account"}`}>
            <View style={styles.accountCopy}><Text style={styles.accountName}>{account.name ?? "Unnamed account"}</Text><Text style={styles.accountMeta}>{account.email ?? "No email"} · {account.role}</Text></View>
            {account.id === user?.id ? <Text style={styles.current}>Current</Text> : null}
          </Pressable>)}
        </ScrollView>
      </View> : null}
    </View>
  </>;
}

const styles = StyleSheet.create({
  dock: { position: "absolute", right: 14, bottom: 18, alignItems: "flex-end", zIndex: 1000 },
  trigger: { backgroundColor: "#2b1f2a", borderColor: "#f04488", borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  triggerText: { color: "#ff82b7", fontSize: 11, fontWeight: "900" },
  panel: { width: 312, maxHeight: 380, marginBottom: 9, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: "#4b4050", backgroundColor: "#1d1d21", shadowColor: "#000", shadowOpacity: 0.34, shadowRadius: 18, elevation: 10 },
  title: { color: "#f7f7f8", fontSize: 14, fontWeight: "900" },
  copy: { color: "#b4b4bd", fontSize: 11, lineHeight: 16, marginTop: 4 },
  list: { marginTop: 10 }, listContent: { gap: 7 },
  account: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#35353b", borderRadius: 12, padding: 10, backgroundColor: "#151518" },
  activeAccount: { borderColor: "#f04488", backgroundColor: "#2b1f2a" }, pressed: { opacity: 0.72 },
  accountCopy: { flex: 1 }, accountName: { color: "#f7f7f8", fontSize: 12, fontWeight: "800" }, accountMeta: { color: "#b4b4bd", fontSize: 10, marginTop: 3 }, current: { color: "#ff82b7", fontSize: 10, fontWeight: "900" },
});
