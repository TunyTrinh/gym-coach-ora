import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";

const SPECTRUM_COLORS = ["#e53f87", "#ed5f68", "#d87870", "#9660bd", "#5266e6"];

function SpectrumFill({ opacity = 1 }: { opacity?: number }) {
  return (
    <Svg pointerEvents="none" width="100%" height="100%" style={styles.spectrumFill}>
      <Defs>
        <LinearGradient id="gymflow-spectrum" x1="0" y1="0" x2="1" y2="1">
          {SPECTRUM_COLORS.map((color, index) => <Stop key={color} offset={`${(index / (SPECTRUM_COLORS.length - 1)) * 100}%`} stopColor={color} />)}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#gymflow-spectrum)" opacity={opacity} />
    </Svg>
  );
}

export function SpectrumCard({ children, style, onPress, accessibilityLabel, intensity = "full" }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; intensity?: "full" | "muted" }) {
  const reducedMotion = useReducedMotion();
  const content = (
    <View style={[styles.spectrumCard, style]}>
      <SpectrumFill opacity={intensity === "full" ? 1 : 0.68} />
      <View style={styles.spectrumSheen} />
      <View style={styles.spectrumContent}>{children}</View>
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && (reducedMotion ? styles.pressed : styles.cardPressed)}>{content}</Pressable>;
}

export function ScreenHeader({ title, subtitle, onPress, icon = "bell.fill", badge, label = "COACHORA" }: { title: string; subtitle?: string; onPress?: () => void; icon?: any; badge?: number; label?: string }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{label}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open notifications" style={({ pressed }) => [styles.iconButton, { backgroundColor: "#151518", borderColor: colors.border }, pressed && styles.pressed]}>
        <IconSymbol name={icon} size={20} color={colors.foreground} />
        {badge ? <View style={[styles.badgeDot, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text></View> : null}
      </Pressable> : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, eyebrow }: { title: string; action?: string; onAction?: () => void; eyebrow?: string }) {
  const colors = useColors();
  return <View style={styles.sectionRow}><View>{eyebrow ? <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>{eyebrow}</Text> : null}<Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>{action && onAction ? <Pressable onPress={onAction} accessibilityRole="button"><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function SurfaceCard({ children, style, onPress, accessibilityLabel }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const content = <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && (reducedMotion ? styles.pressed : styles.cardPressed)}>{content}</Pressable>;
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "error" | "neutral" | "accent" }) {
  const colors = useColors();
  const palette = { success: { bg: `${colors.success}20`, text: colors.success }, warning: { bg: `${colors.warning}20`, text: colors.warning }, error: { bg: `${colors.error}20`, text: colors.error }, neutral: { bg: "rgba(255,255,255,0.07)", text: colors.muted }, accent: { bg: `${colors.primary}22`, text: "#ff94bf" } }[tone];
  return <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}><Text style={[styles.statusText, { color: palette.text }]}>{label}</Text></View>;
}

export function Avatar({ initials, accent, size = 44 }: { initials: string; accent?: string; size?: number }) {
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: accent ?? "#9660bd" }]}><Text style={[styles.avatarText, { fontSize: size * 0.31 }]}>{initials}</Text></View>;
}

export function PrimaryButton({ title, onPress, icon, disabled = false }: { title: string; onPress: () => void; icon?: any; disabled?: boolean }) {
  const reducedMotion = useReducedMotion();
  const handlePress = () => { haptic.light(); onPress(); };
  return <Pressable onPress={handlePress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabledButton, pressed && !disabled && (reducedMotion ? styles.pressed : styles.buttonPressed)]}>
    {!disabled ? <SpectrumFill /> : null}
    <View style={styles.buttonContent}>{icon ? <IconSymbol name={icon} size={18} color="#ffffff" /> : null}<Text style={styles.primaryButtonText}>{title}</Text></View>
  </Pressable>;
}

export function GhostButton({ title, onPress, icon }: { title: string; onPress: () => void; icon?: any }) {
  const colors = useColors();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.ghostButton, { borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.025)" }, pressed && styles.pressed]}>{icon ? <IconSymbol name={icon} size={16} color={colors.primary} /> : null}<Text style={[styles.ghostButtonText, { color: colors.foreground }]}>{title}</Text></Pressable>;
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
  spectrumCard: { overflow: "hidden", borderRadius: 24, minHeight: 108 },
  spectrumSheen: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,8,12,0.08)" },
  spectrumContent: { flex: 1, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 6 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.8, marginBottom: 6 },
  title: { fontSize: 31, fontWeight: "800", letterSpacing: -1, lineHeight: 37 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  iconButton: { width: 46, height: 46, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  badgeDot: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: "#0d0d0f" },
  badgeText: { color: "#ffffff", fontSize: 9, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionEyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: "800" },
  card: { borderRadius: 22, borderWidth: 1, padding: 17 },
  pressed: { opacity: 0.72 },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.15 },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  avatarText: { color: "#0d0d0f", fontWeight: "800" },
  primaryButton: { minHeight: 52, borderRadius: 16, overflow: "hidden", justifyContent: "center" },
  disabledButton: { backgroundColor: "#303036" },
  buttonContent: { minHeight: 52, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  ghostButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  ghostButtonText: { fontSize: 13, fontWeight: "800" },
  offlineBanner: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  offlineText: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, width: "100%", marginVertical: 14 },
});
