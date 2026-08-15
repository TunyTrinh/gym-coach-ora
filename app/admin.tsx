import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMemo, useState } from "react";

import { PrimaryButton, ScreenHeader, SpectrumCard, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";

type AccountMode = "new" | "existing";
type FormState = { fullName: string; username: string; password: string; specialty: string; gymId: number | null; clientUserId: number | null };
const emptyForm = (): FormState => ({ fullName: "", username: "", password: "", specialty: "", gymId: null, clientUserId: null });

export default function AdminScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const colors = useColors();
  const [form, setForm] = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [accountMode, setAccountMode] = useState<AccountMode>("new");
  const [feedback, setFeedback] = useState<{ title: string; body: string; tone: "success" | "error" } | null>(null);
  const coachAccounts = trpc.admin.listCoachAccounts.useQuery(undefined, { enabled: user?.role === "admin" });
  const gyms = trpc.admin.listActiveGyms.useQuery(undefined, { enabled: user?.role === "admin" });
  const clients = trpc.admin.listClientAccounts.useQuery(undefined, { enabled: user?.role === "admin" });
  const createCoach = trpc.admin.createCoach.useMutation({
    onSuccess: async () => {
      await coachAccounts.refetch();
      setShowCreate(false);
      setForm(emptyForm());
      setFeedback({ title: t("coachAccountCreated"), body: t("coachAccountCreatedBody"), tone: "success" });
    },
    onError: (error) => setFeedback({ title: t("coachAccountCreateFailed"), body: error.message || t("coachAccountCreateFailed"), tone: "error" }),
  });
  const promoteClient = trpc.admin.promoteClient.useMutation({
    onSuccess: async () => {
      await Promise.all([coachAccounts.refetch(), clients.refetch()]);
      setShowCreate(false);
      setForm(emptyForm());
      setFeedback({ title: t("clientPromoted"), body: t("coachAccountCreatedBody"), tone: "success" });
    },
    onError: (error) => setFeedback({ title: t("coachAccountCreateFailed"), body: error.message || t("coachAccountCreateFailed"), tone: "error" }),
  });

  const activeGym = useMemo(() => gyms.data?.find((gym) => gym.id === form.gymId), [form.gymId, gyms.data]);
  const selectedClient = useMemo(() => clients.data?.find((client) => client.id === form.clientUserId), [clients.data, form.clientUserId]);
  const isSubmitting = createCoach.isPending || promoteClient.isPending;
  const canCreate = Boolean(form.fullName.trim() && form.specialty.trim() && form.gymId && (accountMode === "new" ? form.username.trim() && form.password : form.clientUserId) && !isSubmitting);
  const submit = () => {
    if (!form.gymId) {
      setFeedback({ title: t("coachAccountCreateFailed"), body: t("selectGym"), tone: "error" });
      return;
    }
    if (accountMode === "existing") {
      if (!form.clientUserId) {
        setFeedback({ title: t("coachAccountCreateFailed"), body: t("selectClient"), tone: "error" });
        return;
      }
      promoteClient.mutate({ userId: form.clientUserId, fullName: form.fullName, specialty: form.specialty, gymId: form.gymId });
      return;
    }
    createCoach.mutate({ fullName: form.fullName, username: form.username, password: form.password, specialty: form.specialty, gymId: form.gymId });
  };

  if (user?.role !== "admin") {
    return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}><View style={styles.restricted}><ScreenHeader title={t("coachAccounts")} subtitle={t("adminAccessRequired")} label={t("restricted")} /><PrimaryButton title={t("back")} onPress={() => router.back()} /></View></ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
    <View style={styles.topBar}><Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("back")} style={styles.backButton}><Text style={styles.backText}>‹ {t("back")}</Text></Pressable></View>
    <FlatList
      data={coachAccounts.data ?? []}
      keyExtractor={(item) => String(item.coachId)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<><ScreenHeader title={t("coachAccounts")} subtitle={t("coachAccountsBody")} label={t("admin")} /><SpectrumCard style={styles.hero}><Text style={styles.heroEyebrow}>{t("admin").toUpperCase()}</Text><Text style={styles.heroTitle}>{t("createCoachAccount")}</Text><Text style={styles.heroBody}>{t("createCoachAccountBody")}</Text><PrimaryButton title={t("createCoachAccount")} onPress={() => setShowCreate(true)} /></SpectrumCard><Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("coachAccounts").toUpperCase()}</Text></>}
      ListEmptyComponent={coachAccounts.isLoading ? <ActivityIndicator color="#ff82b7" style={{ marginTop: 26 }} /> : <SurfaceCard style={styles.empty}><Text style={[styles.emptyText, { color: colors.muted }]}>{t("noCoachAccounts")}</Text></SurfaceCard>}
      renderItem={({ item }) => <SurfaceCard style={styles.coachRow}><View style={styles.avatar}><Text style={styles.avatarText}>{item.fullName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.coachCopy}><Text style={[styles.coachName, { color: colors.foreground }]}>{item.fullName}</Text><Text style={[styles.coachMeta, { color: colors.muted }]}>{item.specialty}</Text><Text style={[styles.coachMeta, { color: colors.muted }]}>{item.username}</Text></View><Text style={styles.activeBadge}>COACH</Text></SurfaceCard>}
    />
    <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t("createCoachAccount")}</Text><Text style={[styles.sheetCopy, { color: colors.muted }]}>{accountMode === "new" ? t("createCoachAccountBody") : t("promoteClientBody")}</Text></View><Pressable onPress={() => setShowCreate(false)} accessibilityRole="button" accessibilityLabel={t("close")} style={styles.closeButton}><Text style={[styles.closeText, { color: colors.foreground }]}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"><View style={styles.modeRow}><ModeButton label={t("newCoachAccount")} active={accountMode === "new"} onPress={() => setAccountMode("new")} /><ModeButton label={t("promoteClient")} active={accountMode === "existing"} onPress={() => setAccountMode("existing")} /></View>{accountMode === "existing" ? <><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("selectClient")}</Text><View style={styles.gymChoices}>{clients.isLoading ? <ActivityIndicator color="#ff82b7" /> : clients.data?.length ? clients.data.map((client) => <Pressable key={client.id} onPress={() => setForm((current) => ({ ...current, clientUserId: client.id, fullName: current.fullName || client.name || "" }))} accessibilityRole="button" accessibilityState={{ selected: form.clientUserId === client.id }} style={[styles.gymChoice, { borderColor: form.clientUserId === client.id ? "#f04488" : colors.border, backgroundColor: form.clientUserId === client.id ? "#2b1f2a" : "#151518" }]}><Text style={[styles.gymName, { color: form.clientUserId === client.id ? "#ff82b7" : colors.foreground }]}>{client.name || client.username}</Text><Text style={[styles.gymAddress, { color: colors.muted }]}>{client.username}</Text></Pressable>) : <Text style={[styles.emptyInline, { color: colors.muted }]}>{t("noClientAccounts")}</Text>}</View>{selectedClient ? <Text style={[styles.selectedGym, { color: "#ff82b7" }]}>{selectedClient.name || selectedClient.username}</Text> : null}</> : <><Field label={t("username")} value={form.username} placeholder={t("username")} onChangeText={(username) => setForm((current) => ({ ...current, username }))} autoCapitalize="none" /><Field label={t("initialPassword")} value={form.password} placeholder={t("initialPassword")} onChangeText={(password) => setForm((current) => ({ ...current, password }))} secureTextEntry /><Text style={[styles.passwordHint, { color: colors.muted }]}>{t("coachPasswordHint")}</Text></>}<Field label={t("fullName")} value={form.fullName} placeholder={t("fullName")} onChangeText={(fullName) => setForm((current) => ({ ...current, fullName }))} /><Field label={t("specialty")} value={form.specialty} placeholder={t("specialty")} onChangeText={(specialty) => setForm((current) => ({ ...current, specialty }))} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("gym")}</Text><View style={styles.gymChoices}>{gyms.isLoading ? <ActivityIndicator color="#ff82b7" /> : gyms.data?.map((gym) => <Pressable key={gym.id} onPress={() => setForm((current) => ({ ...current, gymId: gym.id }))} accessibilityRole="button" accessibilityState={{ selected: form.gymId === gym.id }} style={[styles.gymChoice, { borderColor: form.gymId === gym.id ? "#f04488" : colors.border, backgroundColor: form.gymId === gym.id ? "#2b1f2a" : "#151518" }]}><Text style={[styles.gymName, { color: form.gymId === gym.id ? "#ff82b7" : colors.foreground }]}>{gym.name}</Text><Text style={[styles.gymAddress, { color: colors.muted }]} numberOfLines={1}>{gym.address}</Text></Pressable>)}</View>{activeGym ? <Text style={[styles.selectedGym, { color: "#ff82b7" }]}>{activeGym.name}</Text> : null}<PrimaryButton title={isSubmitting ? t("loading") : accountMode === "new" ? t("createCoachAccount") : t("promoteClient")} onPress={submit} disabled={!canCreate} /></ScrollView></View></View></Modal>
    <Modal visible={Boolean(feedback)} transparent animationType="fade" onRequestClose={() => setFeedback(null)}><View style={styles.backdrop}><SurfaceCard style={styles.feedback}><Text style={[styles.feedbackTitle, { color: feedback?.tone === "error" ? "#ff766e" : "#32d77b" }]}>{feedback?.title}</Text><Text style={[styles.feedbackBody, { color: colors.muted }]}>{feedback?.body}</Text><PrimaryButton title={t("close")} onPress={() => setFeedback(null)} /></SurfaceCard></View></Modal>
  </ScreenContainer>;
}

function Field({ label, value, placeholder, onChangeText, autoCapitalize = "sentences", secureTextEntry = false }: { label: string; value: string; placeholder: string; onChangeText: (value: string) => void; autoCapitalize?: "none" | "sentences"; secureTextEntry?: boolean }) {
  const colors = useColors();
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#777780" autoCapitalize={autoCapitalize} autoCorrect={false} secureTextEntry={secureTextEntry} style={[styles.input, { color: colors.foreground, borderColor: "#000000" }]} /></View>;
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.modeButton, { borderColor: active ? "#f04488" : colors.border, backgroundColor: active ? "#2b1f2a" : "#151518" }]}><Text style={[styles.modeButtonText, { color: active ? "#ff82b7" : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  topBar: { height: 38, justifyContent: "center" }, backButton: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 14 }, backText: { color: "#ff82b7", fontSize: 14, fontWeight: "800" }, content: { paddingTop: 2, paddingBottom: 32, gap: 11 }, hero: { gap: 7, marginTop: 4, marginBottom: 8 }, heroEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, heroTitle: { color: "#ffffff", fontSize: 21, fontWeight: "900" }, heroBody: { color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 18, marginBottom: 6 }, sectionLabel: { marginTop: 4, marginLeft: 2, fontSize: 10, letterSpacing: 1.3, fontWeight: "900" }, empty: { marginTop: 8, padding: 20, alignItems: "center" }, emptyText: { fontSize: 13, fontWeight: "700" }, coachRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 14 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#2b1f2a" }, avatarText: { color: "#ff82b7", fontSize: 17, fontWeight: "900" }, coachCopy: { flex: 1, gap: 2 }, coachName: { fontSize: 15, fontWeight: "800" }, coachMeta: { fontSize: 11 }, activeBadge: { color: "#a98af0", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "flex-end", padding: 16 }, sheet: { maxHeight: "92%", borderRadius: 25, borderWidth: 1, padding: 18 }, sheetHeader: { flexDirection: "row", gap: 12, marginBottom: 16 }, sheetTitle: { fontSize: 20, fontWeight: "900" }, sheetCopy: { fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 285 }, closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1d1d21", alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 25, lineHeight: 29 }, form: { gap: 12, paddingBottom: 12 }, field: { gap: 6 }, fieldLabel: { fontSize: 11, letterSpacing: 0.7, fontWeight: "800" }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, backgroundColor: "#111113", paddingHorizontal: 13, fontSize: 15 }, passwordHint: { fontSize: 11, lineHeight: 16, marginTop: -4 }, modeRow: { flexDirection: "row", gap: 8 }, modeButton: { flex: 1, borderWidth: 1, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, modeButtonText: { fontSize: 11, fontWeight: "800", textAlign: "center" }, gymChoices: { gap: 8 }, gymChoice: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 }, gymName: { fontSize: 14, fontWeight: "800" }, gymAddress: { fontSize: 11, marginTop: 3 }, selectedGym: { fontSize: 11, fontWeight: "800", marginTop: -4 }, emptyInline: { fontSize: 12, lineHeight: 18, paddingVertical: 8 }, feedback: { gap: 12, alignSelf: "stretch", marginBottom: "45%" }, feedbackTitle: { fontSize: 19, fontWeight: "900" }, feedbackBody: { fontSize: 13, lineHeight: 20 }, restricted: { flex: 1, justifyContent: "center", gap: 16 },
});
