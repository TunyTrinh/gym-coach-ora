import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { haptic } from "@/lib/haptics";

export type CoachoraRole = "coach" | "admin" | "client";
export type StatusTone = "success" | "warning" | "error" | "neutral" | "accent" | "booked" | "closed";

const SIGNATURE_COLORS = ["#FF6B7A", "#C65FE0", "#FFB86B"];

export const ROLE_ACCENTS: Record<CoachoraRole, string> = {
  coach: "#45C9C0",
  admin: "#F2B84B",
  client: "#FF6F91",
};

export function getRoleAccent(role: CoachoraRole) {
  return ROLE_ACCENTS[role];
}

function SpectrumFill({ opacity = 1 }: { opacity?: number }) {
  return <Svg pointerEvents="none" width="100%" height="100%" style={styles.spectrumFill}>
    <Defs>
      <LinearGradient id="coachora-signature-gradient" x1="0" y1="0" x2="1" y2="1">
        {SIGNATURE_COLORS.map((color, index) => <Stop key={color} offset={`${(index / (SIGNATURE_COLORS.length - 1)) * 100}%`} stopColor={color} />)}
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill="url(#coachora-signature-gradient)" opacity={opacity} />
  </Svg>;
}

/** The only full-gradient container. Each screen may render this at most once. */
export function HeroCard({ children, style, onPress, accessibilityLabel, intensity = "full" }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; intensity?: "full" | "muted" }) {
  const reducedMotion = useReducedMotion();
  const content = <View style={[styles.heroCard, style]}><SpectrumFill opacity={intensity === "full" ? 1 : 0.72} /><View style={styles.heroSheen} /><View style={styles.heroContent}>{children}</View></View>;
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && (reducedMotion ? styles.pressed : styles.cardPressed)}>{content}</Pressable>;
}

/** @deprecated Use HeroCard. Retained temporarily to preserve existing flows during the visual migration. */
export const SpectrumCard = HeroCard;

export function ScreenHeader({ title, subtitle, onPress, icon = "bell.fill", badge, label, role }: { title: string; subtitle?: string; onPress?: () => void; icon?: any; badge?: number; label?: string; role?: CoachoraRole }) {
  const colors = useColors();
  const inferredRole: CoachoraRole = role ?? (label?.toLowerCase().includes("admin") ? "admin" : label?.toLowerCase().includes("coach") ? "coach" : "client");
  const accent = getRoleAccent(inferredRole);
  const roleLabel = label ?? inferredRole.charAt(0).toUpperCase() + inferredRole.slice(1);
  return <View style={styles.header}>
    <View style={styles.headerCopy}>
      <View style={[styles.roleBadge, { borderColor: `${accent}55`, backgroundColor: `${accent}14` }]}><View style={[styles.roleBadgeDot, { backgroundColor: accent }]} /><Text style={[styles.roleBadgeText, { color: accent }]}>{roleLabel}</Text></View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle ?? "Ready when you are"}</Text>
    </View>
    {onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open notifications" style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}>
      <IconSymbol name={icon} size={20} color={colors.foreground} />
      {badge ? <View style={[styles.badgeDot, { backgroundColor: accent }]}><Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text></View> : null}
    </Pressable> : null}
  </View>;
}

export function SectionTitle({ title, action, onAction, eyebrow, role = "client" }: { title: string; action?: string; onAction?: () => void; eyebrow?: string; role?: CoachoraRole }) {
  const colors = useColors();
  const accent = getRoleAccent(role);
  return <View style={styles.sectionRow}><View>{eyebrow ? <Text style={[styles.sectionEyebrow, { color: accent }]}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>{action && onAction ? <Pressable onPress={onAction} accessibilityRole="button"><Text style={[styles.sectionAction, { color: accent }]}>{action}</Text></Pressable> : null}</View>;
}

export function SurfaceCard({ children, style, onPress, accessibilityLabel }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const content = <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && (reducedMotion ? styles.pressed : styles.cardPressed)}>{content}</Pressable>;
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  const colors = useColors();
  const palette: Record<StatusTone, { bg: string; text: string }> = {
    success: { bg: `${colors.success}1F`, text: colors.success },
    warning: { bg: `${colors.warning}1F`, text: colors.warning },
    error: { bg: `${colors.error}1F`, text: colors.error },
    neutral: { bg: `${colors.closed}24`, text: colors.muted },
    accent: { bg: `${colors.client}22`, text: colors.client },
    booked: { bg: `${colors.booked}20`, text: colors.booked },
    closed: { bg: `${colors.closed}28`, text: colors.closed },
  };
  const item = palette[tone];
  return <View style={[styles.statusBadge, { backgroundColor: item.bg }]}><View style={[styles.statusDot, { backgroundColor: item.text }]} /><Text style={[styles.statusText, { color: item.text }]}>{label}</Text></View>;
}

export function Avatar({ initials, accent, size = 44 }: { initials: string; accent?: string; size?: number }) {
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: accent ?? "#45C9C0" }]}><Text style={[styles.avatarText, { fontSize: size * 0.31 }]}>{initials}</Text></View>;
}

/** The one primary CTA allowed per screen; use SecondaryButton for all other actions. */
export function PrimaryButton({ title, onPress, icon, disabled = false }: { title: string; onPress: () => void; icon?: any; disabled?: boolean }) {
  const reducedMotion = useReducedMotion();
  const handlePress = () => { haptic.light(); onPress(); };
  return <Pressable onPress={handlePress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabledButton, pressed && !disabled && (reducedMotion ? styles.pressed : styles.buttonPressed)]}>
    {!disabled ? <SpectrumFill /> : null}
    <View style={styles.buttonContent}>{icon ? <IconSymbol name={icon} size={18} color="#ffffff" /> : null}<Text style={styles.primaryButtonText}>{title}</Text></View>
  </Pressable>;
}

export function SecondaryButton({ title, onPress, icon, disabled = false, role = "client" }: { title: string; onPress: () => void; icon?: any; disabled?: boolean; role?: CoachoraRole }) {
  const colors = useColors();
  const accent = getRoleAccent(role);
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.surface2, borderColor: colors.border }, disabled && styles.secondaryDisabled, pressed && !disabled && styles.pressed]}>
    {icon ? <IconSymbol name={icon} size={16} color={disabled ? colors.tertiary : accent} /> : null}<Text style={[styles.secondaryButtonText, { color: disabled ? colors.tertiary : colors.foreground }]}>{title}</Text>
  </Pressable>;
}

export function GhostButton({ title, onPress, icon, role = "client" }: { title: string; onPress: () => void; icon?: any; role?: CoachoraRole }) {
  return <SecondaryButton title={title} onPress={onPress} icon={icon} role={role} />;
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
  heroCard: { overflow: "hidden", borderRadius: 20, minHeight: 108, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  heroSheen: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,11,15,0.08)" },
  heroContent: { flex: 1, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 6 },
  headerCopy: { flex: 1 },
  roleBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  roleBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  roleBadgeText: { fontSize: 10, lineHeight: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.7, lineHeight: 34 },
  subtitle: { fontSize: 15, lineHeight: 20, marginTop: 5 },
  iconButton: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  badgeDot: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: "#0B0B0F" },
  badgeText: { color: "#0B0B0F", fontSize: 9, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 0.9, marginBottom: 4, textTransform: "uppercase" },
  sectionTitle: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.35 },
  sectionAction: { fontSize: 13, fontWeight: "700" },
  card: { borderRadius: 20, borderWidth: 1, padding: 17 },
  pressed: { opacity: 0.72 }, cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 }, statusText: { fontSize: 11, lineHeight: 14, fontWeight: "800", letterSpacing: 0.1 },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }, avatarText: { color: "#0B0B0F", fontWeight: "800" },
  primaryButton: { minHeight: 52, borderRadius: 14, overflow: "hidden", justifyContent: "center", backgroundColor: "#FF6F91" }, disabledButton: { backgroundColor: "#2A2A33" },
  buttonContent: { minHeight: 52, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secondaryButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, secondaryDisabled: { opacity: 0.52 }, secondaryButtonText: { fontSize: 13, fontWeight: "700" },
  offlineBanner: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 }, offlineText: { fontSize: 12, fontWeight: "700" }, divider: { height: 1, width: "100%", marginVertical: 14 },
});
