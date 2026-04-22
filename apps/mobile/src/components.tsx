import Feather from "@expo/vector-icons/Feather";
import { Pressable, Text, View } from "react-native";

import { colors } from "./helpers";
import { styles } from "./styles";
import type { SubmitResult } from "./types";

export type FeatherName = React.ComponentProps<typeof Feather>["name"];

export function ActionButton({
  label,
  icon,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  icon?: FeatherName;
  onPress?: () => void;
  variant?: "primary" | "warm" | "quiet" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        disabled && styles.button_disabled,
        pressed && !disabled && styles.button_pressed,
      ]}
    >
      {icon ? <Feather name={icon} size={18} color={variant === "quiet" || variant === "ghost" ? colors.green : "#fff"} /> : null}
      <Text style={[styles.buttonText, (variant === "quiet" || variant === "ghost") && styles.buttonTextQuiet]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "mint" | "gold" }) {
  return <View style={[styles.card, tone === "mint" && styles.cardMint, tone === "gold" && styles.cardGold]}>{children}</View>;
}

export function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "done" | "danger" | "warm" }) {
  return (
    <View style={[styles.badge, tone !== "default" && styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, tone !== "default" && styles.badgeTextStrong]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ eyebrow, title, meta }: { eyebrow?: string; title: string; meta?: string }) {
  return (
    <View style={styles.sectionTitle}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

export function Header({
  title,
  subtitle,
  onLogout,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onLogout?: () => void;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.shrink}>
        <Text style={styles.headerKicker}>{subtitle}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {onBack ? <ActionButton label="뒤로" icon="arrow-left" variant="ghost" onPress={onBack} /> : null}
      {onLogout ? <ActionButton label="나가기" icon="log-out" variant="ghost" onPress={onLogout} /> : null}
    </View>
  );
}

export function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: FeatherName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Feather name={icon} size={18} color={active ? "#fff" : colors.green} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.assignmentStat, wide && styles.assignmentStatWide]}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function Metric({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <View style={[styles.metric, danger && styles.metricDanger]}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={[styles.metricValue, danger && styles.metricValueDanger]}>{value}</Text>
    </View>
  );
}

export function ResultBrief({ result, onOpen, onReview }: { result: SubmitResult; onOpen: () => void; onReview: () => void }) {
  return (
    <Card tone="gold">
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.eyebrow}>최근 결과</Text>
          <Text style={styles.cardTitle}>
            {result.score}/{result.outOf}
          </Text>
        </View>
        <Badge label={result.wrongCount > 0 ? `오답 ${result.wrongCount}` : "만점"} tone={result.wrongCount > 0 ? "warm" : "done"} />
      </View>
      <View style={styles.twoCol}>
        <ActionButton label="자세히" icon="bar-chart-2" variant="quiet" onPress={onOpen} />
        {result.wrongCount > 0 ? <ActionButton label="복습" icon="rotate-ccw" variant="warm" onPress={onReview} /> : null}
      </View>
    </Card>
  );
}
