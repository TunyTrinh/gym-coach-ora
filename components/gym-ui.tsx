import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";

const SPECTRUM_COLORS = ["#e53f87", "#ed5f68", "#d87870", "#9660bd", "#5266e6"];
const AVATAR_COLORS = ["#7C3AED", "#3B82F6", "#EC4899", "#F59E0B", "#34D399"];

function SpectrumFill({ opacity = 1 }: { opacity?: number }) {
  return (
    <Svg pointerEvents="none" width="100%" height="100%" style={styles.spectrumFill}>
      <Defs>
        <LinearGradient id="coachora-spectrum" x1="0" y1="0" x2="1" y2="1">
          {SPECTRUM_COLORS.map((color, index) => <Stop key={color} offset={`${(index / (SPECTRUM_COLORS.length - 1)) * 100}%`} stopColor={color} />)}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#coachora-spectrum)" opacity={opacity} />
    </Svg>
  );
}

export function SpectrumCard({ children, style, onPress, accessibilityLabel, intensity = "full" }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; intensity?: "full" | "muted" }) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const content = (
    <View style={[styles.spectrumCard, { backgroundColor: intensity === "full" ? colors.surface2 : colors.surface, borderColor: colors.border }, style]}>
      <View style={styles.spectrumContent}>{children}</View>
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && (reducedMotion ? styles.pressed : styles.cardPressed)}>{content}</Pressable>;
}

export function ScreenHeader({ title, subtitle, onPress, icon = "bell.fill", badge, label = "COACHORA", buttonAccessibilityLabel = "Open notifications" }: { title: string; subtitle?: string; onPress?: () => void; icon?: any; badge?: number; label?: string; buttonAccessibilityLabel?: string }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{label}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={buttonAccessibilityLabel} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}>
        <IconSymbol name={icon} size={20} color={colors.foreground} />
        {badge ? <View style={[styles.badgeDot, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text></View> : null}
      </Pressable> : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, eyebrow }: { title: string; action?: string; onAction?: () => void; eyebrow?: string }) {
  const colors = useColors();
  return <View style={styles.sectionRow}><View>{eyebrow ? <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>{action && onAction ? <Pressable onPress={onAction} accessibilityRole="button"><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function SurfaceCard({ children, style, onPress, accessibilityLabel }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const content = <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && (reducedMotion ? styles.pressed : styles.cardPressed)}>{content}</Pressable>;
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "error" | "neutral" | "accent" | "info" | "pro" }) {
  const colors = useColors();
  const palette = { success: { bg: `${colors.success}1F`, text: colors.success }, warning: { bg: `${colors.warning}1F`, text: colors.warning }, error: { bg: `${colors.error}1F`, text: colors.error }, neutral: { bg: `${colors.mutedStrong}1F`, text: colors.muted }, accent: { bg: `${colors.primary}1F`, text: colors.primary }, info: { bg: `${colors.info}1F`, text: colors.info }, pro: { bg: `${colors.pro}1F`, text: colors.pro } }[tone];
  return <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}><Text style={[styles.statusText, { color: palette.text }]}>{label}</Text></View>;
}

export function Avatar({ initials, accent, size = 44 }: { initials: string; accent?: string; size?: number }) {
  const deterministicAccent = accent ?? AVATAR_COLORS[Array.from(initials).reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: deterministicAccent }]}><Text style={[styles.avatarText, { fontSize: size * 0.31 }]}>{initials}</Text></View>;
}

export function PrimaryButton({ title, onPress, icon, disabled = false }: { title: string; onPress: () => void; icon?: any; disabled?: boolean }) {
  const reducedMotion = useReducedMotion();
  const handlePress = () => { haptic.light(); onPress(); };
  return <Pressable onPress={handlePress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabledButton, pressed && !disabled && (reducedMotion ? styles.pressed : styles.buttonPressed)]}>
    {!disabled ? <SpectrumFill /> : null}
    <View style={styles.buttonContent}>{icon ? <IconSymbol name={icon} size={18} color="#ffffff" /> : null}<Text style={styles.primaryButtonText}>{title}</Text></View>
  </Pressable>;
}

export function GhostButton({ title, onPress, icon }: { title: string; onPress: () => void; icon?: any }) {
  const colors = useColors();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.ghostButton, { borderColor: colors.border, backgroundColor: colors.surface2 }, pressed && styles.pressed]}>{icon ? <IconSymbol name={icon} size={16} color={colors.primary} /> : null}<Text style={[styles.ghostButtonText, { color: colors.foreground }]}>{title}</Text></Pressable>;
}

export const SecondaryButton = GhostButton;

export function IconButton({ icon, onPress, accessibilityLabel }: { icon: any; onPress: () => void; accessibilityLabel: string }) {
  const colors = useColors();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}><IconSymbol name={icon} size={18} color={colors.foreground} /></Pressable>;
}

export function StatCard({ value, label }: { value: string; label: string }) {
  const colors = useColors();
  return <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text></View>;
}

export function OfflineBanner({ label = "Offline-ready mode" }: { label?: string }) {
  const colors = useColors();
  return <View style={[styles.offlineBanner, { backgroundColor: `${colors.warning}16`, borderColor: `${colors.warning}35` }]}><IconSymbol name="wifi.slash" size={15} color={colors.warning} /><Text style={[styles.offlineText, { color: colors.warning }]}>{label}</Text></View>;
}

export function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  spectrumFill: { ...StyleSheet.absoluteFillObject },
  spectrumCard: { overflow: "hidden", borderWidth: 1, borderRadius: 14, minHeight: 108 },
  spectrumSheen: { ...StyleSheet.absoluteFillObject },
  spectrumContent: { flex: 1, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 6 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "600", letterSpacing: -0.25, lineHeight: 27 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  badgeDot: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: "#0d0d0f" },
  badgeText: { color: "#ffffff", fontSize: 9, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionEyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: "800" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  pressed: { opacity: 0.72 },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: "500" },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  avatarText: { color: "#0d0d0f", fontWeight: "800" },
  primaryButton: { minHeight: 50, borderRadius: 14, overflow: "hidden", justifyContent: "center", backgroundColor: "#EC4899" },
  disabledButton: { backgroundColor: "#303036" },
  buttonContent: { minHeight: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  ghostButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  ghostButtonText: { fontSize: 14, fontWeight: "600" },
  statCard: { flex: 1, minHeight: 92, borderWidth: 1, borderRadius: 14, padding: 12, justifyContent: "space-between" },
  statValue: { fontSize: 22, fontWeight: "600" },
  statLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  offlineBanner: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  offlineText: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, width: "100%", marginVertical: 14 },
});
