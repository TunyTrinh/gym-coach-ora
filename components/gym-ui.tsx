import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

export function ScreenHeader({ title, subtitle, onPress, icon = "bell.fill", badge }: { title: string; subtitle?: string; onPress?: () => void; icon?: any; badge?: number }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>NORTHSTAR DOWNTOWN</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open notifications" style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <IconSymbol name={icon} size={21} color={colors.foreground} />
          {badge ? <View style={[styles.badgeDot, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text></View> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action && onAction ? <Pressable onPress={onAction} accessibilityRole="button"><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function SurfaceCard({ children, style, onPress, accessibilityLabel }: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const colors = useColors();
  const content = <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [pressed && styles.pressed]}>{content}</Pressable>;
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "error" | "neutral" | "accent" }) {
  const colors = useColors();
  const palette = {
    success: { bg: `${colors.success}1A`, text: colors.success },
    warning: { bg: `${colors.warning}1A`, text: colors.warning },
    error: { bg: `${colors.error}1A`, text: colors.error },
    neutral: { bg: `${colors.muted}18`, text: colors.muted },
    accent: { bg: `${colors.primary}1A`, text: colors.primary },
  }[tone];
  return <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}><Text style={[styles.statusText, { color: palette.text }]}>{label}</Text></View>;
}

export function Avatar({ initials, accent, size = 44 }: { initials: string; accent?: string; size?: number }) {
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: accent ?? "#dbeafe" }]}><Text style={[styles.avatarText, { fontSize: size * 0.31 }]}>{initials}</Text></View>;
}

export function PrimaryButton({ title, onPress, icon, disabled = false }: { title: string; onPress: () => void; icon?: any; disabled?: boolean }) {
  const colors = useColors();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.primaryButton, { backgroundColor: disabled ? colors.border : colors.primary }, pressed && !disabled && styles.buttonPressed]}>{icon ? <IconSymbol name={icon} size={18} color="#ffffff" /> : null}<Text style={styles.primaryButtonText}>{title}</Text></Pressable>;
}

export function GhostButton({ title, onPress, icon }: { title: string; onPress: () => void; icon?: any }) {
  const colors = useColors();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.ghostButton, { borderColor: colors.border }, pressed && styles.pressed]}>{icon ? <IconSymbol name={icon} size={16} color={colors.primary} /> : null}<Text style={[styles.ghostButtonText, { color: colors.primary }]}>{title}</Text></Pressable>;
}

export function OfflineBanner({ label = "Offline-ready mode" }: { label?: string }) {
  const colors = useColors();
  return <View style={[styles.offlineBanner, { backgroundColor: `${colors.warning}14`, borderColor: `${colors.warning}35` }]}><IconSymbol name="wifi.slash" size={15} color={colors.warning} /><Text style={[styles.offlineText, { color: colors.warning }]}>{label}</Text></View>;
}

export function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 6 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 5 },
  title: { fontSize: 31, fontWeight: "800", letterSpacing: -0.8, lineHeight: 37 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  iconButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  badgeDot: { position: "absolute", top: -4, right: -3, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: "#ffffff" },
  badgeText: { color: "#ffffff", fontSize: 9, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  sectionAction: { fontSize: 13, fontWeight: "700" },
  card: { borderRadius: 22, borderWidth: 1, padding: 17 },
  pressed: { opacity: 0.72 },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#0b1220", fontWeight: "800" },
  primaryButton: { minHeight: 50, borderRadius: 16, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  ghostButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  ghostButtonText: { fontSize: 13, fontWeight: "800" },
  offlineBanner: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  offlineText: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, width: "100%", marginVertical: 14 },
});
