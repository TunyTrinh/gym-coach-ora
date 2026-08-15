import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { PrimaryButton, ScreenHeader, SpectrumCard, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";

type RoomForm = { roomId?: number; gymId: number | null; name: string; address: string; description: string; maximumCapacity: string; active: boolean };
const emptyForm = (): RoomForm => ({ gymId: null, name: "", address: "", description: "", maximumCapacity: "12", active: true });
const dayStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (value: Date, days: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);

export default function RoomsScreen() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const colors = useColors();
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => dayStart(new Date()));
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; body: string; tone: "success" | "error" } | null>(null);
  const rooms = trpc.admin.listRooms.useQuery(undefined, { enabled: user?.role === "admin" });
  const gyms = trpc.admin.listActiveGyms.useQuery(undefined, { enabled: user?.role === "admin" });
  useEffect(() => { if (!selectedRoomId && rooms.data?.[0]) setSelectedRoomId(rooms.data[0].id); }, [rooms.data, selectedRoomId]);
  const dayEnd = useMemo(() => addDays(selectedDay, 1), [selectedDay]);
  const schedule = trpc.admin.roomSchedule.useQuery({ roomId: selectedRoomId ?? 0, from: selectedDay.toISOString(), to: dayEnd.toISOString() }, { enabled: user?.role === "admin" && Boolean(selectedRoomId) });
  const createRoom = trpc.admin.createRoom.useMutation({
    onSuccess: async () => { await rooms.refetch(); setShowForm(false); setForm(emptyForm()); setFeedback({ title: t("roomCreated"), body: t("roomsBody"), tone: "success" }); },
    onError: (error) => setFeedback({ title: t("createRoom"), body: error.message, tone: "error" }),
  });
  const updateRoom = trpc.admin.updateRoom.useMutation({
    onSuccess: async () => { await Promise.all([rooms.refetch(), schedule.refetch()]); setShowForm(false); setForm(emptyForm()); setFeedback({ title: t("roomUpdated"), body: t("roomsBody"), tone: "success" }); },
    onError: (error) => setFeedback({ title: t("editRoom"), body: error.message, tone: "error" }),
  });
  const selectedRoom = rooms.data?.find((room) => room.id === selectedRoomId);
  const valid = Boolean(form.name.trim() && form.address.trim() && form.description.trim() && Number.isInteger(Number(form.maximumCapacity)) && Number(form.maximumCapacity) > 0);
  const saveRoom = () => {
    if (!valid) {
      setFeedback({ title: t("saveRoom"), body: t("roomRequiredFields"), tone: "error" });
      return;
    }
    const payload = { ...(form.gymId ? { gymId: form.gymId } : {}), name: form.name.trim(), address: form.address.trim(), description: form.description.trim(), maximumCapacity: Number(form.maximumCapacity), active: form.active };
    if (form.roomId) {
      if (!form.gymId) {
        setFeedback({ title: t("saveRoom"), body: t("roomRequiredFields"), tone: "error" });
        return;
      }
      updateRoom.mutate({ ...payload, gymId: form.gymId, roomId: form.roomId });
    } else createRoom.mutate(payload);
  };
  const openEdit = () => {
    if (!selectedRoom) return;
    setForm({ roomId: selectedRoom.id, gymId: selectedRoom.gymId, name: selectedRoom.name, address: selectedRoom.address, description: selectedRoom.description, maximumCapacity: String(selectedRoom.maximumCapacity), active: selectedRoom.active });
    setShowForm(true);
  };
  const bookingMap = useMemo(() => {
    const map = new Map<string, { id: string; clientName: string | null; status: string; checkInTime: Date | null; startAt: Date; endAt: Date }[]>();
    for (const booking of schedule.data?.bookings ?? []) {
      const current = map.get(booking.availabilityId) ?? [];
      current.push(booking);
      map.set(booking.availabilityId, current);
    }
    return map;
  }, [schedule.data?.bookings]);

  if (user?.role !== "admin") return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}><View style={styles.restricted}><ScreenHeader title={t("rooms")} subtitle={t("adminAccessRequired")} label={t("restricted")} /><PrimaryButton title={t("back")} onPress={() => router.back()} /></View></ScreenContainer>;

  return <ScreenContainer className="px-5" edges={["top", "bottom", "left", "right"]}>
    <View style={styles.topBar}><Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("back")} style={styles.backButton}><Text style={styles.backText}>‹ {t("back")}</Text></Pressable></View>
    <FlatList
      data={schedule.data?.windows ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}><ScreenHeader title={t("rooms")} subtitle={t("roomsBody")} label={t("admin")} /><SpectrumCard style={styles.hero}><Text style={styles.heroEyebrow}>{t("admin").toUpperCase()}</Text><Text style={styles.heroTitle}>{t("roomSchedule")}</Text><Text style={styles.heroBody}>{t("roomScheduleBody")}</Text><PrimaryButton title={t("createRoom")} onPress={() => { setForm(emptyForm()); setShowForm(true); }} /></SpectrumCard><Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("selectRoom").toUpperCase()}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomRail}>{rooms.isLoading ? <ActivityIndicator color="#ff82b7" /> : rooms.data?.map((room) => <Pressable key={room.id} onPress={() => setSelectedRoomId(room.id)} accessibilityRole="button" accessibilityState={{ selected: room.id === selectedRoomId }} style={[styles.roomPill, { borderColor: room.id === selectedRoomId ? "#f04488" : colors.border, backgroundColor: room.id === selectedRoomId ? "#2b1f2a" : colors.surface }]}><Text style={[styles.roomPillName, { color: room.id === selectedRoomId ? "#ff82b7" : colors.foreground }]}>{room.name}</Text><Text style={[styles.roomPillMeta, { color: colors.muted }]}>{room.maximumCapacity} · {room.active ? t("roomActive") : t("roomInactive")}</Text></Pressable>)}</ScrollView>{!rooms.isLoading && !rooms.data?.length ? <SurfaceCard style={styles.empty}><Text style={[styles.emptyText, { color: colors.muted }]}>{t("noRooms")}</Text></SurfaceCard> : null}{selectedRoom ? <SurfaceCard style={styles.roomInfo}><View style={styles.roomInfoCopy}><Text style={[styles.roomName, { color: colors.foreground }]}>{selectedRoom.name}</Text><Text style={[styles.roomMeta, { color: colors.muted }]}>{selectedRoom.address}</Text><Text style={[styles.roomMeta, { color: colors.muted }]}>{selectedRoom.description}</Text><Text style={styles.capacity}>{selectedRoom.maximumCapacity} {t("clientsInRoom").toLowerCase()}</Text></View><Pressable onPress={openEdit} accessibilityRole="button" style={styles.editButton}><Text style={styles.editText}>{t("editRoom")}</Text></Pressable></SurfaceCard> : null}<View style={styles.dateNav}><Pressable onPress={() => setSelectedDay((current) => addDays(current, -1))} accessibilityRole="button" style={styles.dateButton}><Text style={styles.dateButtonText}>‹ {t("previousDay")}</Text></Pressable><Text style={[styles.selectedDate, { color: colors.foreground }]}>{formatDateLocalized(selectedDay, language, { weekday: "long", month: "short", day: "numeric" })}</Text><Pressable onPress={() => setSelectedDay((current) => addDays(current, 1))} accessibilityRole="button" style={styles.dateButton}><Text style={styles.dateButtonText}>{t("nextDay")} ›</Text></Pressable></View><Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("roomSchedule").toUpperCase()}</Text></View>}
      ListEmptyComponent={schedule.isLoading ? <ActivityIndicator color="#ff82b7" style={{ marginTop: 24 }} /> : selectedRoom ? <SurfaceCard style={styles.empty}><Text style={[styles.emptyText, { color: colors.muted }]}>{t("noRoomSchedule")}</Text></SurfaceCard> : null}
      renderItem={({ item }) => { const participants = bookingMap.get(item.id) ?? []; return <SurfaceCard style={styles.shiftCard}><View style={styles.shiftTop}><View><Text style={[styles.shiftTime, { color: colors.foreground }]}>{formatTimeLocalized(item.startAt, language)}–{formatTimeLocalized(item.endAt, language)}</Text><Text style={[styles.shiftCoach, { color: colors.muted }]}>{item.coachName}</Text></View><Text style={[styles.status, item.status === "available" ? styles.statusOpen : styles.statusBusy]}>{item.status}</Text></View><Text style={[styles.shiftMeta, { color: colors.muted }]}>{participants.length}/{item.maximumCapacity} {t("clientsInRoom").toLowerCase()}{item.note ? ` · ${item.note}` : ""}</Text>{participants.map((participant) => <View key={participant.id} style={[styles.participant, { borderTopColor: colors.border }]}><View><Text style={[styles.participantName, { color: colors.foreground }]}>{participant.clientName ?? "—"}</Text><Text style={[styles.participantMeta, { color: colors.muted }]}>{t("bookingStatus")}: {participant.status}{participant.checkInTime ? ` · ${t("attendance")}` : ""}</Text></View></View>)}</SurfaceCard>; }}
    />
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{form.roomId ? t("editRoom") : t("createRoom")}</Text><Text style={[styles.sheetCopy, { color: colors.muted }]}>{t("roomsBody")}</Text></View><Pressable onPress={() => setShowForm(false)} accessibilityRole="button" accessibilityLabel={t("close")} style={styles.closeButton}><Text style={[styles.closeText, { color: colors.foreground }]}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"><Field label={t("roomName")} value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} /><Field label={t("roomAddress")} value={form.address} onChangeText={(address) => setForm((current) => ({ ...current, address }))} /><Field label={t("roomDescription")} value={form.description} multiline onChangeText={(description) => setForm((current) => ({ ...current, description }))} /><Field label={t("roomCapacity")} value={form.maximumCapacity} keyboardType="numeric" onChangeText={(maximumCapacity) => setForm((current) => ({ ...current, maximumCapacity }))} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("roomGymOptional")}</Text>{gyms.data?.length ? <View style={styles.gymChoices}>{gyms.data.map((gym) => <Pressable key={gym.id} onPress={() => setForm((current) => ({ ...current, gymId: gym.id }))} accessibilityRole="button" accessibilityState={{ selected: form.gymId === gym.id }} style={[styles.gymChoice, { borderColor: form.gymId === gym.id ? "#f04488" : colors.border, backgroundColor: form.gymId === gym.id ? "#2b1f2a" : "#151518" }]}><Text style={[styles.gymName, { color: form.gymId === gym.id ? "#ff82b7" : colors.foreground }]}>{gym.name}</Text><Text style={[styles.gymAddress, { color: colors.muted }]}>{gym.address}</Text></Pressable>)}</View> : <Text style={[styles.sheetCopy, { color: colors.muted }]}>{t("roomDefaultGymHint")}</Text>}{form.roomId ? <Pressable onPress={() => setForm((current) => ({ ...current, active: !current.active }))} accessibilityRole="checkbox" accessibilityState={{ checked: form.active }} style={[styles.activeToggle, { borderColor: colors.border }]}><Text style={[styles.activeToggleText, { color: colors.foreground }]}>{form.active ? "✓" : "○"} {form.active ? t("roomActive") : t("roomInactive")}</Text></Pressable> : null}<PrimaryButton title={(createRoom.isPending || updateRoom.isPending) ? t("loading") : t("saveRoom")} onPress={saveRoom} disabled={createRoom.isPending || updateRoom.isPending} /></ScrollView></View></View></Modal>
    <Modal visible={Boolean(feedback)} transparent animationType="fade" onRequestClose={() => setFeedback(null)}><View style={styles.backdrop}><SurfaceCard style={styles.feedback}><Text style={[styles.feedbackTitle, { color: feedback?.tone === "error" ? "#ff766e" : "#32d77b" }]}>{feedback?.title}</Text><Text style={[styles.feedbackBody, { color: colors.muted }]}>{feedback?.body}</Text><PrimaryButton title={t("close")} onPress={() => setFeedback(null)} /></SurfaceCard></View></Modal>
  </ScreenContainer>;
}

function Field({ label, value, onChangeText, multiline = false, keyboardType = "default" }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; keyboardType?: "default" | "numeric" }) { const colors = useColors(); return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={keyboardType} autoCorrect={false} style={[styles.input, multiline && styles.multiline, { color: colors.foreground, borderColor: "#000000" }]} /></View>; }

const styles = StyleSheet.create({
  topBar: { height: 38, justifyContent: "center" }, backButton: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 14 }, backText: { color: "#ff82b7", fontSize: 14, fontWeight: "800" }, content: { paddingTop: 2, paddingBottom: 32, gap: 10 }, header: { gap: 10 }, hero: { gap: 7, marginTop: 4 }, heroEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, heroTitle: { color: "#ffffff", fontSize: 21, fontWeight: "900" }, heroBody: { color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 18, marginBottom: 6 }, sectionLabel: { marginTop: 3, marginLeft: 2, fontSize: 10, letterSpacing: 1.3, fontWeight: "900" }, roomRail: { gap: 8, paddingVertical: 2, paddingRight: 16 }, roomPill: { width: 148, borderWidth: 1, borderRadius: 13, padding: 11 }, roomPillName: { fontSize: 14, fontWeight: "800" }, roomPillMeta: { fontSize: 10, marginTop: 3 }, roomInfo: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, roomInfoCopy: { flex: 1, gap: 3 }, roomName: { fontSize: 16, fontWeight: "900" }, roomMeta: { fontSize: 11, lineHeight: 16 }, capacity: { color: "#ff82b7", fontSize: 11, fontWeight: "800", marginTop: 2 }, editButton: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#2b1f2a", borderRadius: 9 }, editText: { color: "#ff82b7", fontSize: 10, fontWeight: "900" }, dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, dateButton: { paddingVertical: 8, paddingHorizontal: 7 }, dateButtonText: { color: "#ff82b7", fontSize: 10, fontWeight: "800" }, selectedDate: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "800" }, empty: { marginTop: 6, padding: 19, alignItems: "center" }, emptyText: { fontSize: 13, fontWeight: "700", textAlign: "center" }, shiftCard: { gap: 8 }, shiftTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, shiftTime: { fontSize: 16, fontWeight: "900" }, shiftCoach: { fontSize: 12, marginTop: 2 }, status: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" }, statusOpen: { color: "#32d77b" }, statusBusy: { color: "#ffbd2e" }, shiftMeta: { fontSize: 11 }, participant: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 }, participantName: { fontSize: 13, fontWeight: "800" }, participantMeta: { fontSize: 11, marginTop: 2 }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "flex-end", padding: 16 }, sheet: { maxHeight: "92%", borderRadius: 25, borderWidth: 1, padding: 18 }, sheetHeader: { flexDirection: "row", gap: 12, marginBottom: 16 }, sheetTitle: { fontSize: 20, fontWeight: "900" }, sheetCopy: { fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 285 }, closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1d1d21", alignItems: "center", justifyContent: "center" }, closeText: { fontSize: 25, lineHeight: 29 }, form: { gap: 12, paddingBottom: 12 }, field: { gap: 6 }, fieldLabel: { fontSize: 11, letterSpacing: 0.7, fontWeight: "800" }, input: { minHeight: 48, borderRadius: 13, borderWidth: 1, backgroundColor: "#111113", paddingHorizontal: 13, fontSize: 15 }, multiline: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" }, gymChoices: { gap: 8 }, gymChoice: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 }, gymName: { fontSize: 14, fontWeight: "800" }, gymAddress: { fontSize: 11, marginTop: 3 }, activeToggle: { padding: 12, borderWidth: 1, borderRadius: 13 }, activeToggleText: { fontSize: 13, fontWeight: "800" }, feedback: { gap: 12, alignSelf: "stretch", marginBottom: "45%" }, feedbackTitle: { fontSize: 19, fontWeight: "900" }, feedbackBody: { fontSize: 13, lineHeight: 20 }, restricted: { flex: 1, justifyContent: "center", gap: 16 },
});
