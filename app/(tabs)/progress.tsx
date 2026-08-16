import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { PrimaryButton, ScreenHeader, SpectrumCard, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useGym } from "@/lib/gym-store";
import { haptic } from "@/lib/haptics";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";
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
  const { snapshot, saveMeasurement } = useGym();
  const { t } = useLanguage();
  const role = isLocalTestMode() ? snapshot.member.role : user?.role ?? snapshot.member.role;
  const [metricKey, setMetricKey] = useState<HealthMeasurementKey>("weightKg");
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const reducedMotion = useReducedMotion();
  const records = useMemo(() => [...snapshot.measurements].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()), [snapshot.measurements]);
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
    const result = await saveMeasurement(measurement);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? "Progress saved" : "Couldn’t save", result.success ? result.message ?? "Measurement saved." : result.error);
    if (result.success) { setShowForm(false); setForm(emptyForm()); }
  };

  if (role !== "client") {
    const isAdmin = role === "admin";
    return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View style={styles.restricted}>
        <ScreenHeader title={isAdmin ? t("users") : "Staff tools"} subtitle={isAdmin ? t("coachAccountsBody") : "Health progress is private to each client."} label={isAdmin ? t("admin").toUpperCase() : "COACH"} />
        <SurfaceCard style={styles.restrictedCard}>
          <Text style={[styles.restrictedTitle, { color: colors.foreground }]}>{isAdmin ? t("coachAccounts") : "Manage availability"}</Text>
          <Text style={[styles.restrictedCopy, { color: colors.muted }]}>{isAdmin ? t("coachAccountsBody") : "Publish or manage coach time from the staff workspace."}</Text>
          <PrimaryButton title={isAdmin ? t("coachAccounts") : "Open availability"} onPress={() => router.replace(isAdmin ? "/admin" : "/book")} />
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
      <Text style={[styles.privateNote, { color: colors.muted }]}>Measurements are stored locally in this Coachora profile and are not visible to coaches or other members.</Text>
    </ScrollView>
    <MeasurementHistory visible={showHistory} entries={activeEntries} metric={activeMetric} colors={colors} onClose={() => setShowHistory(false)} />
    <MeasurementForm visible={showForm} form={form} colors={colors} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} onClose={() => setShowForm(false)} onSave={handleSave} />
  </ScreenContainer>;
}

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
  return <View style={compact ? styles.formFieldCompact : styles.formField}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#777780" keyboardType={keyboardType} style={[styles.textInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: "#151518" }]} /></View>;
}

function localDateString(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function formatValue(value: number, unit: string) { return `${value.toFixed(unit === "%" ? 1 : 1).replace(/\.0$/, "")}${unit === "%" ? "%" : ` ${unit}`}`; }
function formatDelta(value: number | undefined, unit: string) { if (typeof value !== "number") return "No comparison"; const direction = value > 0 ? "+" : ""; return `${direction}${formatValue(value, unit)}`; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 38, gap: 16 }, restricted: { paddingTop: 10, gap: 18 }, restrictedCard: { gap: 12, padding: 19 }, restrictedTitle: { fontSize: 20, fontWeight: "900" }, restrictedCopy: { fontSize: 13, lineHeight: 20 }, closeText: { fontSize: 26, lineHeight: 29, fontWeight: "400" },
  heroCard: { minHeight: 158 }, heroEyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, heroValue: { color: "#ffffff", fontSize: 38, fontWeight: "900", letterSpacing: -1.4, marginTop: 7 }, heroMetric: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "700", marginTop: 3 }, heroDelta: { position: "absolute", right: 18, bottom: 18, alignItems: "flex-end" }, heroDeltaLabel: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, heroDeltaValue: { color: "#ffffff", fontSize: 16, fontWeight: "900", marginTop: 4 },
  metricRail: { gap: 8, paddingRight: 18 }, metricPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }, chartCard: { gap: 14 }, chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, chartTitle: { fontSize: 17, fontWeight: "800" }, chartCopy: { fontSize: 12, marginTop: 3 }, chartRange: { fontSize: 16, fontWeight: "900" }, svgWrap: { gap: 4 }, chartFoot: { flexDirection: "row", justifyContent: "space-between" }, chartFootText: { fontSize: 10, fontWeight: "700" }, chartEmpty: { height: 150, justifyContent: "center", alignItems: "center", borderRadius: 16, backgroundColor: "#151518", paddingHorizontal: 28 }, chartEmptyText: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  comparisonHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 2 }, sectionEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, sectionTitle: { fontSize: 20, fontWeight: "800", marginTop: 3 }, addButton: { minHeight: 36, borderRadius: 18, backgroundColor: "#f04488", paddingHorizontal: 14, justifyContent: "center" }, addButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" }, addPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] }, historySummary: { minHeight: 78, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, historySummaryCopy: { flex: 1 }, historySummaryTitle: { fontSize: 15, fontWeight: "800" }, historySummaryDetail: { fontSize: 11, lineHeight: 17, marginTop: 4 }, historySummaryAction: { color: "#ff82b7", fontSize: 12, fontWeight: "800" }, privateNote: { fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 16 }, pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" }, modalCard: { maxHeight: "88%", borderTopWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, historySheet: { maxHeight: "78%", minHeight: 320, borderTopWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, modalTitle: { fontSize: 21, fontWeight: "900" }, modalCopy: { fontSize: 12, marginTop: 4 }, modalClose: { width: 34, height: 34, alignItems: "center", justifyContent: "center" }, historyList: { gap: 9, paddingTop: 18, paddingBottom: 12 }, historyItem: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 13 }, historyDate: { fontSize: 14, fontWeight: "800" }, historyItemLabel: { fontSize: 10, marginTop: 4 }, historyItemValue: { alignItems: "flex-end", gap: 4 }, historyValue: { fontSize: 16, fontWeight: "900" }, historyDelta: { fontSize: 10, fontWeight: "700" }, historyEmpty: { height: 180, justifyContent: "center", alignItems: "center" }, formContent: { paddingTop: 18, gap: 15, paddingBottom: 12 }, formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, formField: { gap: 6 }, formFieldCompact: { width: "48.5%", gap: 6 }, fieldLabel: { fontSize: 10, fontWeight: "800" }, textInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, fontWeight: "700" },
});
