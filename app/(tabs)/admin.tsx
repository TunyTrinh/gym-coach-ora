import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMemo, useState } from "react";

import { PrimaryButton, ScreenHeader, SpectrumCard, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { TypedConfirmSheet } from "@/components/typed-confirm-sheet";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";

type FormState = { fullName: string; email: string; specialty: string; gymId: number | null; coachId?: number };
const emptyForm = (): FormState => ({ fullName: "", email: "", specialty: "", gymId: null });

export default function AdminScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const colors = useColors();
  const [form, setForm] = useState(emptyForm);
  const [showAuthorize, setShowAuthorize] = useState(false);
  const [coachToDelete, setCoachToDelete] = useState<{ coachId: number; fullName: string } | null>(null);
  const [feedback, setFeedback] = useState<{ title: string; body: string; tone: "success" | "error" } | null>(null);
  const coachAccounts = trpc.admin.listCoachAccounts.useQuery(undefined, { enabled: user?.role === "admin" });
  const gyms = trpc.admin.listActiveGyms.useQuery(undefined, { enabled: user?.role === "admin" });
  const utils = trpc.useUtils();
  const invalidateCoachConsumers = () => Promise.all([utils.catalog.coaches.invalidate(), utils.availability.mine.invalidate(), utils.availability.bookable.invalidate(), utils.availability.bookableAll.invalidate(), utils.availability.coachSchedule.invalidate(), utils.availability.roomSchedule.invalidate(), utils.availability.roomCalendar.invalidate(), utils.member.schedule.invalidate()]);
  const authorizeCoach = trpc.admin.authorizeCoach.useMutation({
    onSuccess: async () => {
      await Promise.all([coachAccounts.refetch(), invalidateCoachConsumers()]);
      setShowAuthorize(false);
      setForm(emptyForm());
      setFeedback({ title: t("coachAccountCreated"), body: t("coachAccountCreatedBody"), tone: "success" });
    },
    onError: (error) => setFeedback({ title: t("coachAccountCreateFailed"), body: error.message || t("coachAccountCreateFailed"), tone: "error" }),
  });
  const changeAccess = trpc.admin.changeCoachAccess.useMutation({
    onSuccess: async () => {
      await Promise.all([coachAccounts.refetch(), invalidateCoachConsumers()]);
      setFeedback({ title: t("coachAccessUpdated"), body: t("coachAccessUpdatedBody"), tone: "success" });
    },
    onError: (error) => setFeedback({ title: t("coachAccountCreateFailed"), body: error.message || t("coachAccountCreateFailed"), tone: "error" }),
  });
  const deleteCoach = trpc.admin.deleteCoach.useMutation({
    onSuccess: async () => {
      await Promise.all([coachAccounts.refetch(), invalidateCoachConsumers()]);
      setCoachToDelete(null);
      setFeedback({ title: t("deleteCoachSuccess"), body: t("deleteConfirmationBody"), tone: "success" });
    },
    onError: (error) => setFeedback({ title: t("deleteCoach"), body: error.message || t("coachAccountCreateFailed"), tone: "error" }),
  });

  const activeGym = useMemo(() => gyms.data?.find((gym) => gym.id === form.gymId), [form.gymId, gyms.data]);
  const canAuthorize = Boolean(form.fullName.trim() && form.email.trim() && form.specialty.trim() && !authorizeCoach.isPending);
  const accessLabel = (status: "authorized" | "revoked" | "disabled" | null) => status === "authorized" ? t("authorized") : status === "disabled" ? t("disabled") : t("revoked");
  const openRestore = (item: { coachId: number; fullName: string; email: string | null; linkedEmail: string | null; specialty: string; gymId: number | null }) => {
    setForm({ coachId: item.coachId, fullName: item.fullName, email: item.email || item.linkedEmail || "", specialty: item.specialty, gymId: item.gymId });
    setShowAuthorize(true);
  };
  const isAuthenticatedAdmin = user?.role === "admin";

  if (!isAuthenticatedAdmin) {
    return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}><View style={styles.restricted}><ScreenHeader title={t("coachAccounts")} subtitle={t("adminAccessRequired")} label={t("restricted")} /><PrimaryButton title={t("back")} onPress={() => router.back()} /></View></ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
    <View style={styles.topBar}><Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("back")} style={styles.backButton}><Text style={styles.backText}>‹ {t("back")}</Text></Pressable></View>
    <FlatList
      data={coachAccounts.data ?? []}
      keyExtractor={(item) => String(item.coachId)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<><ScreenHeader title={t("coachAccounts")} subtitle={t("coachAccountsBody")} label={t("admin")} /><SpectrumCard style={styles.hero}><Text style={styles.heroEyebrow}>{t("admin").toUpperCase()}</Text><Text style={styles.heroTitle}>{t("authorizeCoach")}</Text><Text style={styles.heroBody}>{t("createCoachAccountBody")}</Text><PrimaryButton title={t("authorizeCoach")} onPress={() => { setForm(emptyForm()); setShowAuthorize(true); }} /></SpectrumCard><Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("coachAccounts").toUpperCase()}</Text></>}
      ListEmptyComponent={coachAccounts.isLoading ? <ActivityIndicator color="#ff82b7" style={{ marginTop: 26 }} /> : <SurfaceCard style={styles.empty}><Text style={[styles.emptyText, { color: colors.muted }]}>{t("noCoachAccounts")}</Text></SurfaceCard>}
      renderItem={({ item }) => <SurfaceCard style={styles.coachRow}><View style={styles.avatar}><Text style={styles.avatarText}>{item.fullName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.coachCopy}><Text style={[styles.coachName, { color: colors.foreground }]}>{item.fullName}</Text><Text style={[styles.coachMeta, { color: colors.muted }]}>{item.specialty}</Text><Text style={[styles.coachMeta, { color: colors.muted }]}>{item.email || item.linkedEmail || "—"}</Text></View><View style={styles.accessActions}><Text style={[styles.statusBadge, item.authorizationStatus === "authorized" ? styles.statusAuthorized : styles.statusInactive]}>{accessLabel(item.authorizationStatus)}</Text>{item.active ? <View style={styles.actionRow}>{item.authorizationStatus === "authorized" ? <><Pressable onPress={() => changeAccess.mutate({ coachId: item.coachId, status: "disabled" })} disabled={changeAccess.isPending} accessibilityRole="button" style={styles.minorAction}><Text style={styles.minorActionText}>{t("disableCoach")}</Text></Pressable><Pressable onPress={() => changeAccess.mutate({ coachId: item.coachId, status: "revoked" })} disabled={changeAccess.isPending} accessibilityRole="button" style={styles.dangerAction}><Text style={styles.dangerActionText}>{t("revokeCoach")}</Text></Pressable></> : <Pressable onPress={() => openRestore(item)} accessibilityRole="button" style={styles.restoreAction}><Text style={styles.restoreActionText}>{t("restoreCoach")}</Text></Pressable>}<Pressable onPress={() => setCoachToDelete({ coachId: item.coachId, fullName: item.fullName })} disabled={deleteCoach.isPending} accessibilityRole="button" style={styles.deleteAction}><Text style={styles.dangerActionText}>{t("deleteCoach")}</Text></Pressable></View> : null}</View></SurfaceCard>}
    />
    <Modal visible={showAuthorize} transparent animationType="slide" onRequestClose={() => setShowAuthorize(false)}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{form.coachId ? t("restoreCoach") : t("authorizeCoach")}</Text><Text style={[styles.sheetCopy, { color: colors.muted }]}>{t("createCoachAccountBody")}</Text></View><Pressable onPress={() => setShowAuthorize(false)} accessibilityRole="button" accessibilityLabel={t("close")} style={styles.closeButton}><Text style={[styles.closeText, { color: colors.foreground }]}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"><Field label={t("googleEmail")} value={form.email} placeholder={t("googleEmail")} onChangeText={(email) => setForm((current) => ({ ...current, email }))} autoCapitalize="none" keyboardType="email-address" /><Text style={[styles.helper, { color: colors.muted }]}>{t("verifiedGoogleEmail")}</Text><Field label={t("fullName")} value={form.fullName} placeholder={t("fullName")} onChangeText={(fullName) => setForm((current) => ({ ...current, fullName }))} /><Field label={t("specialty")} value={form.specialty} placeholder={t("specialty")} onChangeText={(specialty) => setForm((current) => ({ ...current, specialty }))} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("gymOptional")}</Text><Text style={[styles.helper, { color: colors.muted }]}>{t("coachGymDefaultRoomHint")}</Text><View style={styles.gymChoices}><Pressable onPress={() => setForm((current) => ({ ...current, gymId: null }))} accessibilityRole="button" accessibilityState={{ selected: form.gymId === null }} style={[styles.gymChoice, { borderColor: form.gymId === null ? "#f04488" : colors.border, backgroundColor: form.gymId === null ? "#2b1f2a" : "#151518" }]}><Text style={[styles.gymName, { color: form.gymId === null ? "#ff82b7" : colors.foreground }]}>{t("noGymAssigned")}</Text></Pressable>{gyms.isLoading ? <ActivityIndicator color="#ff82b7" /> : gyms.data?.map((gym) => <Pressable key={gym.id} onPress={() => setForm((current) => ({ ...current, gymId: gym.id }))} accessibilityRole="button" accessibilityState={{ selected: form.gymId === gym.id }} style={[styles.gymChoice, { borderColor: form.gymId === gym.id ? "#f04488" : colors.border, backgroundColor: form.gymId === gym.id ? "#2b1f2a" : "#151518" }]}><Text style={[styles.gymName, { color: form.gymId === gym.id ? "#ff82b7" : colors.foreground }]}>{gym.name}</Text><Text style={[styles.gymAddress, { color: colors.muted }]} numberOfLines={1}>{gym.address}</Text></Pressable>)}</View>{activeGym ? <Text style={[styles.selectedGym, { color: "#ff82b7" }]}>{activeGym.name}</Text> : null}<PrimaryButton title={authorizeCoach.isPending ? t("loading") : form.coachId ? t("restoreCoach") : t("authorizeCoach")} onPress={() => authorizeCoach.mutate({ ...form })} disabled={!canAuthorize} /></ScrollView></View></View></Modal>
    <TypedConfirmSheet visible={Boolean(coachToDelete)} title={t("deleteCoach")} message={t("deleteConfirmationBody")} itemName={coachToDelete?.fullName ?? ""} inputLabel={t("typeNameToConfirm")} cancelLabel={t("cancel")} confirmLabel={t("deleteCoach")} onCancel={() => setCoachToDelete(null)} onConfirm={(confirmationName) => coachToDelete && deleteCoach.mutate({ coachId: coachToDelete.coachId, confirmationName })} pending={deleteCoach.isPending} />
    <Modal visible={Boolean(feedback)} transparent animationType="fade" onRequestClose={() => setFeedback(null)}><View style={styles.backdrop}><SurfaceCard style={styles.feedback}><Text style={[styles.feedbackTitle, { color: feedback?.tone === "error" ? "#ff766e" : "#32d77b" }]}>{feedback?.title}</Text><Text style={[styles.feedbackBody, { color: colors.muted }]}>{feedback?.body}</Text><PrimaryButton title={t("close")} onPress={() => setFeedback(null)} /></SurfaceCard></View></Modal>
  </ScreenContainer>;
}

function Field({ label, value, placeholder, onChangeText, autoCapitalize = "sentences", keyboardType = "default" }: { label: string; value: string; placeholder: string; onChangeText: (value: string) => void; autoCapitalize?: "none" | "sentences"; keyboardType?: "default" | "email-address" }) {
  const colors = useColors();
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#777780" autoCapitalize={autoCapitalize} autoCorrect={false} keyboardType={keyboardType} style={[styles.input, { color: colors.foreground, borderColor: "#000000" }]} /></View>;
}

const styles = StyleSheet.create({
  topBar: { height: 38, justifyContent: "center" }, backButton: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 14 }, backText: { color: "#ff82b7", fontSize: 14, fontWeight: "800" }, content: { paddingTop: 2, paddingBottom: 32, gap: 11 }, hero: { gap: 7, marginTop: 4, marginBottom: 8 }, heroEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, heroTitle: { color: "#ffffff", fontSize: 21, fontWeight: "900" }, heroBody: { color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 18, marginBottom: 6 }, sectionLabel: { marginTop: 4, marginLeft: 2, fontSize: 10, letterSpacing: 1.3, fontWeight: "900" }, empty: { marginTop: 8, padding: 20, alignItems: "center" }, emptyText: { fontSize: 13, fontWeight: "700" }, coachRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 14 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#2b1f2a" }, avatarText: { color: "#ff82b7", fontSize: 17, fontWeight: "900" }, coachCopy: { flex: 1, gap: 2 }, coachName: { fontSize: 15, fontWeight: "800" }, coachMeta: { fontSize: 11 }, accessActions: { alignItems: "flex-end", gap: 6 }, statusBadge: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 }, statusAuthorized: { color: "#32d77b" }, statusInactive: { color: "#ffbd2e" }, actionRow: { flexDirection: "row", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }, minorAction: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: "#26262b" }, minorActionText: { color: "#f7f7f8", fontSize: 9, fontWeight: "800" }, dangerAction: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: "#391f22" }, deleteAction: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, backgroundColor: "#5b2028" }, dangerActionText: { color: "#ff9994", fontSize: 9, fontWeight: "800" }, restoreAction: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "#2b1f2a" }, restoreActionText: { color: "#ff82b7", fontSize: 9, fontWeight: "800" }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "flex-end", padding: 16 }, sheet: { maxHeight: "92%", borderRadius: 25, borderWidth: 1, padding: 18 }, sheetHeader: { flexDirection: "row", gap: 12, marginBottom: 16 }, sheetTitle: { fontSize: 20, fontWeight: "900" }, sheetCopy: { fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 285 }, closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1d1d21", alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 25, lineHeight: 29 }, form: { gap: 12, paddingBottom: 12 }, field: { gap: 6 }, fieldLabel: { fontSize: 11, letterSpacing: 0.7, fontWeight: "800" }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, backgroundColor: "#111113", paddingHorizontal: 13, fontSize: 15 }, helper: { fontSize: 11, lineHeight: 16, marginTop: -4 }, gymChoices: { gap: 8 }, gymChoice: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 }, gymName: { fontSize: 14, fontWeight: "800" }, gymAddress: { fontSize: 11, marginTop: 3 }, selectedGym: { fontSize: 11, fontWeight: "800", marginTop: -4 }, feedback: { gap: 12, alignSelf: "stretch", marginBottom: "45%" }, feedbackTitle: { fontSize: 19, fontWeight: "900" }, feedbackBody: { fontSize: 13, lineHeight: 20 }, restricted: { flex: 1, justifyContent: "center", gap: 16 },
});
