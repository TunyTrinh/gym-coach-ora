import { useEffect } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CenteredDialogProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  dismissible?: boolean;
  accessibilityLabel?: string;
};

/**
 * A full-viewport dialog foundation for success, information, confirmation, warning, and error states.
 * The Modal owns the viewport; the safe area and flex centering keep the content independent of any
 * parent card or scroll container across native and web surfaces.
 */
export function CenteredDialog({ visible, onRequestClose, children, contentStyle, dismissible = true, accessibilityLabel = "Dialog" }: CenteredDialogProps) {
  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscrollBehavior = body.style.overscrollBehavior;
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [visible]);

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent presentationStyle="overFullScreen" onRequestClose={onRequestClose}>
    <View style={styles.viewport}>
      {dismissible ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={onRequestClose} style={styles.backdropDismiss} /> : null}
      <SafeAreaView pointerEvents="box-none" edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View pointerEvents="box-none" style={styles.centerFrame}>
            <View accessibilityRole="alert" accessibilityViewIsModal accessibilityLabel={accessibilityLabel} style={[styles.card, contentStyle]}>{children}</View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: "rgba(4, 5, 7, 0.72)" },
  backdropDismiss: { ...StyleSheet.absoluteFillObject },
  safeArea: { flex: 1 },
  keyboardArea: { flex: 1 },
  centerFrame: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 20 },
  card: { width: "100%", maxWidth: 440, maxHeight: "100%", alignItems: "center" },
});
