import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { Avatar, PrimaryButton, ScreenHeader, SpectrumCard, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";
import type { HealthMeasurementInput, HealthMeasurementKey, HealthMeasurementRecord } from "@/shared/gym";

const metrics: { key: HealthMeasurementKey; label: string; shortLabel: string; unit: string; accent: string }[] = [
  { key: "weightKg", label: "Weight", shortLabel: "Weight", unit: "kg", accent: "#ff82b7" },
  { key: "bodyFatPercentage", label: "Body fat", shortLabel: "Body fat", unit: "%", accent: "#f0a77a" },
  { key: "chestCm", label: "Chest", shortLabel: "Chest", unit: "cm", accent: "#c89bff" },
  { key: "waistCm", label: "Waist", shortLabel: "Waist", unit: "cm", accent: "#8a77ef" },
  { key: "hipsCm", label: "Hips", shortLabel: "Hips", unit: "cm", accent: "#6f9aff" },
  { key: "armsCm", label: "Arms", shortLabel: "Arms", unit: "cm", accent: "#f07ba8" },
  { key: "thighsCm", label: "Thighs", shortLabel: "Thighs", unit: "cm", accent: "#d48dd4" },
];

const emptyForm = () => ({ date: localDateString(new Date()), weightKg: "", bodyFatPercentage: "", chestCm: "", waistCm: "", hipsCm: "", armsCm: "", thighsCm: "" });

export default function ProgressScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { t } = useLanguage();
  const role = user?.role ?? "client";
  const [metricKey, setMetricKey] = useState<HealthMeasurementKey>("weightKg");
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const reducedMotion = useReducedMotion();
  const productionMeasurements = trpc.member.measurements.useQuery(undefined, { enabled: role === "client" });
  const saveProductionMeasurement = trpc.member.saveMeasurement.useMutation();
  const utils = trpc.useUtils();
  const records = useMemo(() => (productionMeasurements.data ?? []).map((record) => ({ ...record, recordedAt: new Date(record.recordedAt).toISOString() })).sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()), [productionMeasurements.data]);
  const activeMetric = metrics.find((metric) => metric.key === metricKey)!;
  const activeEntries = [...records].filter((record) => typeof record[metricKey] === "number").reverse();
  const latest = activeEntries.at(-1);
  const previous = activeEntries.at(-2);
  const latestValue = latest?.[metricKey] as number | undefined;
  const previousValue = previous?.[metricKey] as number | undefined;
  const delta = typeof latestValue === "number" && typeof previousValue === "number" ? latestValue - previousValue : undefined;

  const handleSave = async () => {
    const measurement: HealthMeasurementInput = { recordedAt: `${form.date}T12:00:00` };
    metrics.forEach((metric) => {
      const raw = form[metric.key];
      if (!raw.trim()) return;
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) measurement[metric.key] = value;
    });
    const result = await saveProductionMeasurement.mutateAsync(measurement).then(() => ({ success: true as const, message: "Measurement saved to your private progress history." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "Measurement could not be saved." }));
    if (result.success) await utils.member.measurements.invalidate();
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? "Progress saved" : "Couldn’t save", result.success ? result.message ?? "Measurement saved." : result.error);
    if (result.success) { setShowForm(false); setForm(emptyForm()); }
  };

  if (role === "coach") return <CoachClientsScreen />;

  if (role !== "client") {
    return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View style={styles.restricted}>
        <ScreenHeader title={t("users")} subtitle={t("coachAccountsBody")} label={t("admin").toUpperCase()} />
        <SurfaceCard style={styles.restrictedCard}>
          <Text style={[styles.restrictedTitle, { color: colors.foreground }]}>{t("coachAccounts")}</Text>
          <Text style={[styles.restrictedCopy, { color: colors.muted }]}>{t("coachAccountsBody")}</Text>
          <PrimaryButton title={t("coachAccounts")} onPress={() => router.replace("/admin")} />
        </SurfaceCard>
      </View>
    </ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Health progress" subtitle="Small signals. Stronger direction." label="PRIVATE TO YOU" />
      <SpectrumCard style={styles.heroCard} intensity="muted"><Text style={styles.heroEyebrow}>LATEST CHECK-IN</Text><Text style={styles.heroValue}>{typeof latestValue === "number" ? formatValue(latestValue, activeMetric.unit) : "—"}</Text><Text style={styles.heroMetric}>{activeMetric.label}{latest ? ` · ${formatDate(latest.recordedAt)}` : ""}</Text><View style={styles.heroDelta}><Text style={styles.heroDeltaLabel}>VS PREVIOUS</Text><Text style={styles.heroDeltaValue}>{formatDelta(delta, activeMetric.unit)}</Text></View></SpectrumCard>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricRail}>{metrics.map((metric) => <Pressable key={metric.key} onPress={() => setMetricKey(metric.key)} accessibilityRole="button" style={({ pressed }) => [styles.metricPill, { borderColor: metric.key === metricKey ? metric.accent : colors.border, backgroundColor: metric.key === metricKey ? "#2a202a" : colors.surface }, pressed && styles.pressed]}><Text style={{ color: metric.key === metricKey ? "#ffffff" : colors.muted, fontSize: 12, fontWeight: "800" }}>{metric.shortLabel}</Text></Pressable>)}</ScrollView>

      <SurfaceCard style={styles.chartCard}><View style={styles.chartHeader}><View><Text style={[styles.chartTitle, { color: colors.foreground }]}>{activeMetric.label} trend</Text><Text style={[styles.chartCopy, { color: colors.muted }]}>{activeEntries.length ? `${activeEntries.length} recorded check-ins` : "Record your first check-in to begin"}</Text></View><Text style={[styles.chartRange, { color: activeMetric.accent }]}>{typeof latestValue === "number" ? formatValue(latestValue, activeMetric.unit) : "—"}</Text></View><ProgressChart entries={activeEntries} metric={activeMetric} colors={colors} /></SurfaceCard>

      <View style={styles.comparisonHeader}><View><Text style={[styles.sectionEyebrow, { color: "#a98af0" }]}>YOUR CHECK-INS</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Keep it simple</Text></View><Pressable onPress={() => { haptic.light(); setShowForm(true); }} accessibilityRole="button" style={({ pressed }) => [styles.addButton, pressed && (reducedMotion ? styles.pressed : styles.addPressed)]}><Text style={styles.addButtonText}>+ Add</Text></Pressable></View>
      <SurfaceCard style={styles.historySummary} onPress={() => setShowHistory(true)} accessibilityLabel={`Open ${activeMetric.label} measurement history`}><View style={styles.historySummaryCopy}><Text style={[styles.historySummaryTitle, { color: colors.foreground }]}>{activeMetric.label} history</Text><Text style={[styles.historySummaryDetail, { color: colors.muted }]}>{activeEntries.length ? `${activeEntries.length} check-ins · latest ${latest ? formatDate(latest.recordedAt) : ""}` : "Your dated check-ins will appear here."}</Text></View><Text style={styles.historySummaryAction}>View</Text></SurfaceCard>
      <Text style={[styles.privateNote, { color: colors.muted }]}>Measurements are stored privately in your Coachora profile and are not visible to coaches or other members.</Text>
    </ScrollView>
    <MeasurementHistory visible={showHistory} entries={activeEntries} metric={activeMetric} colors={colors} onClose={() => setShowHistory(false)} />
    <MeasurementForm visible={showForm} form={form} colors={colors} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} onClose={() => setShowForm(false)} onSave={handleSave} />
  </ScreenContainer>;
}

function CoachClientsScreen() {
  const colors = useColors();
  const { t, language } = useLanguage();
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const clients = trpc.coach.clients.useQuery();
  const selectedClient = clients.data?.find((client) => client.id === selectedClientId) ?? null;
  const notes = trpc.coach.notes.useQuery({ clientUserId: selectedClientId ?? 1 }, { enabled: selectedClientId !== null });
  const saveNote = trpc.coach.saveNote.useMutation();
  const utils = trpc.useUtils();
  const submitNote = async () => {
    const value = note.trim();
    if (!selectedClientId || !value) return;
    try {
      await saveNote.mutateAsync({ clientUserId: selectedClientId, note: value });
      await utils.coach.notes.invalidate({ clientUserId: selectedClientId });
      setNote(""); haptic.success();
    } catch (error) {
      haptic.error(); Alert.alert(t("couldNotSaveNote"), error instanceof Error ? error.message : t("tryAgain"));
    }
  };

  if (selectedClient) return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.coachClientContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Pressable onPress={() => { setSelectedClientId(null); setNote(""); }} accessibilityRole="button" accessibilityLabel={t("backToClients")} style={styles.coachBackButton}><Text style={styles.coachBackText}>‹ {t("clients")}</Text></Pressable>
      <ScreenHeader title={selectedClient.name ?? t("unnamedClient")} subtitle={selectedClient.email ?? t("noEmailAvailable")} label={t("clientInformation").toUpperCase()} />
      <SurfaceCard style={styles.clientIdentityCard}><Avatar initials={clientInitials(selectedClient.name, selectedClient.email)} size={52} /><View style={styles.clientIdentityCopy}><Text style={[styles.clientIdentityTitle, { color: colors.foreground }]}>{selectedClient.name ?? t("unnamedClient")}</Text><Text style={[styles.clientIdentityMeta, { color: colors.muted }]}>{selectedClient.email ?? t("noEmailAvailable")}</Text><Text style={styles.activeRelationship}>{t("activeBookingRelationship")}</Text></View></SurfaceCard>
      <View style={styles.noteSectionHeader}><Text style={[styles.noteSectionTitle, { color: colors.foreground }]}>{t("privateCoachNotes")}</Text><Text style={[styles.noteSectionCopy, { color: colors.muted }]}>{t("privateCoachNotesBody")}</Text></View>
      <SurfaceCard style={styles.noteComposer}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("newPrivateNote").toUpperCase()}</Text><TextInput value={note} onChangeText={setNote} placeholder={t("notePlaceholder")} placeholderTextColor="#85858f" multiline maxLength={4000} accessibilityLabel={t("newPrivateNote")} style={[styles.noteInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: "#151518" }]} /><PrimaryButton title={saveNote.isPending ? t("saving") : t("savePrivateNote")} onPress={() => void submitNote()} disabled={!note.trim() || saveNote.isPending} /></SurfaceCard>
      {notes.isLoading ? <View style={styles.clientLoading}><ActivityIndicator color={colors.primary} /><Text style={[styles.clientLoadingText, { color: colors.muted }]}>{t("loadingNotes")}</Text></View> : notes.isError ? <SurfaceCard style={styles.noteState}><Text accessibilityRole="alert" style={[styles.noteStateTitle, { color: colors.error }]}>{t("notesUnavailable")}</Text><Text style={[styles.noteStateCopy, { color: colors.muted }]}>{t("notesUnavailableBody")}</Text><PrimaryButton title={t("tryAgain")} onPress={() => void notes.refetch()} /></SurfaceCard> : notes.data?.length ? notes.data.map((item) => <SurfaceCard key={item.id} style={styles.savedNote}><Text style={[styles.savedNoteText, { color: colors.foreground }]}>{item.note}</Text><Text style={[styles.savedNoteDate, { color: colors.muted }]}>{new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</Text></SurfaceCard>) : <SurfaceCard style={styles.noteState}><Text style={[styles.noteStateTitle, { color: colors.foreground }]}>{t("noPrivateNotes")}</Text><Text style={[styles.noteStateCopy, { color: colors.muted }]}>{t("noPrivateNotesBody")}</Text></SurfaceCard>}
    </ScrollView>
  </ScreenContainer>;

  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.coachClientsContent} showsVerticalScrollIndicator={false}>
    <ScreenHeader title={t("clients")} subtitle={t("coachClientsSubtitle")} label={t("coach").toUpperCase()} />
    {clients.isLoading ? <View style={styles.clientLoading}><ActivityIndicator color={colors.primary} /><Text style={[styles.clientLoadingText, { color: colors.muted }]}>{t("loadingClients")}</Text></View> : clients.isError ? <SurfaceCard style={styles.noteState}><Text accessibilityRole="alert" style={[styles.noteStateTitle, { color: colors.error }]}>{t("clientsUnavailable")}</Text><Text style={[styles.noteStateCopy, { color: colors.muted }]}>{t("clientsUnavailableBody")}</Text><PrimaryButton title={t("tryAgain")} onPress={() => void clients.refetch()} /></SurfaceCard> : clients.data?.length ? clients.data.map((client) => <SurfaceCard key={client.id} onPress={() => setSelectedClientId(client.id)} accessibilityLabel={`${t("viewClientInformation")}: ${client.name ?? client.email ?? t("unnamedClient")}`} style={styles.clientListCard}><Avatar initials={clientInitials(client.name, client.email)} size={46} /><View style={styles.clientListCopy}><Text style={[styles.clientListName, { color: colors.foreground }]}>{client.name ?? t("unnamedClient")}</Text><Text style={[styles.clientListEmail, { color: colors.muted }]} numberOfLines={2}>{client.email ?? t("noEmailAvailable")}</Text></View><Text style={styles.clientListAction}>{t("view")} ›</Text></SurfaceCard>) : <SurfaceCard style={styles.noteState}><Text style={[styles.noteStateTitle, { color: colors.foreground }]}>{t("noBookedClients")}</Text><Text style={[styles.noteStateCopy, { color: colors.muted }]}>{t("noBookedClientsBody")}</Text></SurfaceCard>}
  </ScrollView></ScreenContainer>;
}

function clientInitials(name: string | null, email: string | null) { const source = name?.trim() || email?.split("@")[0] || "C"; return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }

function MeasurementHistory({ visible, entries, metric, colors, onClose }: { visible: boolean; entries: HealthMeasurementRecord[]; metric: (typeof metrics)[number]; colors: ReturnType<typeof useColors>; onClose: () => void }) {
  const newestFirst = [...entries].reverse();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.historySheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.modalHeader}><View><Text style={[styles.modalTitle, { color: colors.foreground }]}>{metric.label} history</Text><Text style={[styles.modalCopy, { color: colors.muted }]}>Every saved check-in for this metric.</Text></View><Pressable onPress={onClose} style={styles.modalClose} accessibilityRole="button"><Text style={[styles.closeText, { color: colors.foreground }]}>×</Text></Pressable></View><FlatList data={newestFirst} keyExtractor={(entry) => entry.id} contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false} ListEmptyComponent={<View style={styles.historyEmpty}><Text style={[styles.chartEmptyText, { color: colors.muted }]}>No {metric.label.toLowerCase()} check-ins yet.</Text></View>} renderItem={({ item, index }) => { const value = item[metric.key] as number; const prior = newestFirst[index + 1]?.[metric.key] as number | undefined; const change = typeof prior === "number" ? value - prior : undefined; return <SurfaceCard style={styles.historyItem}><View><Text style={[styles.historyDate, { color: colors.foreground }]}>{formatDate(item.recordedAt)}</Text><Text style={[styles.historyItemLabel, { color: colors.muted }]}>{index === 0 ? "Latest check-in" : "Saved check-in"}</Text></View><View style={styles.historyItemValue}><Text style={[styles.historyValue, { color: metric.accent }]}>{formatValue(value, metric.unit)}</Text><Text style={[styles.historyDelta, { color: colors.muted }]}>{formatDelta(change, metric.unit)}</Text></View></SurfaceCard>; }} /></View></View></Modal>;
}

function ProgressChart({ entries, metric, colors }: { entries: HealthMeasurementRecord[]; metric: (typeof metrics)[number]; colors: ReturnType<typeof useColors> }) {
  const values = entries.map((entry) => entry[metric.key] as number);
  if (values.length < 2) return <View style={styles.chartEmpty}><Text style={[styles.chartEmptyText, { color: colors.muted }]}>Add two or more check-ins to compare the trend.</Text></View>;
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, 1); const width = 300; const height = 132; const inset = 20;
  const points = values.map((value, index) => { const x = inset + (index / (values.length - 1)) * (width - inset * 2); const y = inset + (1 - (value - min) / range) * (height - inset * 2); return `${x},${y}`; }).join(" ");
  return <View style={styles.svgWrap}><Svg width="100%" height={150} viewBox={`0 0 ${width} ${height}`}><Line x1={inset} y1={height - inset} x2={width - inset} y2={height - inset} stroke={colors.border} strokeWidth="1" /><Line x1={inset} y1={inset} x2={inset} y2={height - inset} stroke={colors.border} strokeWidth="1" /><Polyline points={points} fill="none" stroke={metric.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{values.map((value, index) => { const x = inset + (index / (values.length - 1)) * (width - inset * 2); const y = inset + (1 - (value - min) / range) * (height - inset * 2); return <Circle key={`${value}-${index}`} cx={x} cy={y} r="4" fill={metric.accent} stroke="#151518" strokeWidth="2" />; })}</Svg><View style={styles.chartFoot}><Text style={[styles.chartFootText, { color: colors.muted }]}>{formatDate(entries[0].recordedAt)}</Text><Text style={[styles.chartFootText, { color: colors.muted }]}>{formatDate(entries.at(-1)!.recordedAt)}</Text></View></View>;
}

function MeasurementForm({ visible, form, colors, onChange, onClose, onSave }: { visible: boolean; form: ReturnType<typeof emptyForm>; colors: ReturnType<typeof useColors>; onChange: (key: keyof ReturnType<typeof emptyForm>, value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.modalHeader}><View><Text style={[styles.modalTitle, { color: colors.foreground }]}>Add measurement</Text><Text style={[styles.modalCopy, { color: colors.muted }]}>Enter the fields you measured today.</Text></View><Pressable onPress={onClose} style={styles.modalClose}><Text style={[styles.closeText, { color: colors.foreground }]}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled"><FormField label="Measurement date" value={form.date} onChangeText={(value) => onChange("date", value)} placeholder="YYYY-MM-DD" colors={colors} /><View style={styles.formGrid}>{metrics.map((metric) => <FormField key={metric.key} label={`${metric.label} (${metric.unit})`} value={form[metric.key]} onChangeText={(value) => onChange(metric.key, value)} placeholder="—" colors={colors} keyboardType="decimal-pad" compact />)}</View><PrimaryButton title="Save measurement" onPress={onSave} icon="checkmark.circle.fill" /></ScrollView></View></View></Modal>;
}

function FormField({ label, value, onChangeText, placeholder, colors, keyboardType = "default", compact = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; keyboardType?: "default" | "decimal-pad"; compact?: boolean }) {
  return <View style={compact ? styles.formFieldCompact : styles.formField}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#777780" keyboardType={keyboardType} accessibilityLabel={label} style={[styles.textInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: "#151518" }]} /></View>;
}

function localDateString(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function formatValue(value: number, unit: string) { return `${value.toFixed(unit === "%" ? 1 : 1).replace(/\.0$/, "")}${unit === "%" ? "%" : ` ${unit}`}`; }
function formatDelta(value: number | undefined, unit: string) { if (typeof value !== "number") return "No comparison"; const direction = value > 0 ? "+" : ""; return `${direction}${formatValue(value, unit)}`; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 38, gap: 16 }, restricted: { paddingTop: 10, gap: 18 }, restrictedCard: { gap: 12, padding: 19 }, restrictedTitle: { fontSize: 20, fontWeight: "900" }, restrictedCopy: { fontSize: 13, lineHeight: 20 }, closeText: { fontSize: 26, lineHeight: 29, fontWeight: "400" },
  heroCard: { minHeight: 158 }, heroEyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, heroValue: { color: "#ffffff", fontSize: 38, fontWeight: "900", letterSpacing: -1.4, marginTop: 7 }, heroMetric: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "700", marginTop: 3 }, heroDelta: { position: "absolute", right: 18, bottom: 18, alignItems: "flex-end" }, heroDeltaLabel: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, heroDeltaValue: { color: "#ffffff", fontSize: 16, fontWeight: "900", marginTop: 4 },
  metricRail: { gap: 8, paddingRight: 18 }, metricPill: { minHeight: 44, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, justifyContent: "center" }, chartCard: { gap: 14 }, chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, chartTitle: { fontSize: 17, fontWeight: "800" }, chartCopy: { fontSize: 12, marginTop: 3 }, chartRange: { fontSize: 16, fontWeight: "900" }, svgWrap: { gap: 4 }, chartFoot: { flexDirection: "row", justifyContent: "space-between" }, chartFootText: { fontSize: 10, fontWeight: "700" }, chartEmpty: { height: 150, justifyContent: "center", alignItems: "center", borderRadius: 16, backgroundColor: "#151518", paddingHorizontal: 28 }, chartEmptyText: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  comparisonHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 2 }, sectionEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, sectionTitle: { fontSize: 20, fontWeight: "800", marginTop: 3 }, addButton: { minHeight: 44, borderRadius: 22, backgroundColor: "#c42d68", paddingHorizontal: 14, justifyContent: "center" }, addButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" }, addPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] }, historySummary: { minHeight: 78, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, historySummaryCopy: { flex: 1 }, historySummaryTitle: { fontSize: 15, fontWeight: "800" }, historySummaryDetail: { fontSize: 11, lineHeight: 17, marginTop: 4 }, historySummaryAction: { color: "#ff82b7", fontSize: 12, fontWeight: "800" }, privateNote: { fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 16 }, pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" }, modalCard: { maxHeight: "88%", borderTopWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, historySheet: { maxHeight: "78%", minHeight: 320, borderTopWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, modalTitle: { fontSize: 21, fontWeight: "900" }, modalCopy: { fontSize: 12, marginTop: 4 }, modalClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, historyList: { gap: 9, paddingTop: 18, paddingBottom: 12 }, historyItem: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 13 }, historyDate: { fontSize: 14, fontWeight: "800" }, historyItemLabel: { fontSize: 10, marginTop: 4 }, historyItemValue: { alignItems: "flex-end", gap: 4 }, historyValue: { fontSize: 16, fontWeight: "900" }, historyDelta: { fontSize: 10, fontWeight: "700" }, historyEmpty: { height: 180, justifyContent: "center", alignItems: "center" }, formContent: { paddingTop: 18, gap: 15, paddingBottom: 12 }, formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, formField: { gap: 6 }, formFieldCompact: { width: "48.5%", gap: 6 }, fieldLabel: { fontSize: 10, fontWeight: "800" }, textInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, fontWeight: "700" },
  coachClientsContent: { paddingTop: 10, paddingBottom: 38, gap: 12 }, coachClientContent: { paddingTop: 4, paddingBottom: 38, gap: 14 }, coachBackButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingRight: 18 }, coachBackText: { color: "#ff82b7", fontSize: 14, fontWeight: "800" }, clientLoading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 12 }, clientLoadingText: { fontSize: 13, fontWeight: "700" },
  clientListCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12 }, clientListCopy: { flex: 1, gap: 3 }, clientListName: { fontSize: 15, fontWeight: "800" }, clientListEmail: { fontSize: 11, lineHeight: 16 }, clientListAction: { color: "#ff82b7", fontSize: 12, fontWeight: "800" }, clientIdentityCard: { flexDirection: "row", alignItems: "center", gap: 14 }, clientIdentityCopy: { flex: 1, gap: 4 }, clientIdentityTitle: { fontSize: 17, fontWeight: "900" }, clientIdentityMeta: { fontSize: 12 }, activeRelationship: { color: "#5fe092", fontSize: 10, lineHeight: 15, fontWeight: "800" },
  noteSectionHeader: { gap: 4, marginTop: 4 }, noteSectionTitle: { fontSize: 18, fontWeight: "900" }, noteSectionCopy: { fontSize: 12, lineHeight: 18 }, noteComposer: { gap: 11 }, noteInput: { minHeight: 104, maxHeight: 180, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, lineHeight: 20, textAlignVertical: "top" }, savedNote: { gap: 9 }, savedNoteText: { fontSize: 14, lineHeight: 21 }, savedNoteDate: { fontSize: 10, fontWeight: "700" }, noteState: { gap: 10, alignItems: "stretch" }, noteStateTitle: { fontSize: 16, fontWeight: "900", textAlign: "center" }, noteStateCopy: { fontSize: 12, lineHeight: 18, textAlign: "center" },
});
