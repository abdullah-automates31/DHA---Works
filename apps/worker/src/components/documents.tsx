import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily } from '@/theme';

import { CheckIcon, PlusIcon } from './icons';

// W03 pieces. Values from worker/screens/dww.css: .upl (dashed 2px #8DB09E, radius 16, 92 high),
// the added state (mint, no border), .card, .av (52), .btn.soft.sm.

export function UploadBox({
  label,
  done,
  busy,
  onPress,
  flex,
}: {
  label: string;
  done: boolean;
  busy: boolean;
  onPress: () => void;
  flex?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      onPress={busy ? undefined : onPress}
      style={[styles.box, done ? styles.boxDone : styles.boxEmpty, flex && { flex: 1 }]}
    >
      {busy ? (
        <ActivityIndicator color={colors.green} />
      ) : done ? (
        <CheckIcon size={22} color={colors.green} />
      ) : (
        <PlusIcon size={22} color={colors.green} />
      )}
      <Text style={styles.boxText}>{label}</Text>
    </Pressable>
  );
}

export function ProfilePhotoCard({
  title,
  help,
  buttonLabel,
  photoUrl,
  initials,
  busy,
  onPress,
}: {
  title: string;
  help: string;
  buttonLabel: string;
  photoUrl: string | null;
  initials: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.avatar} contentFit="cover" accessibilityLabel={title} />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardHelp}>{help}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${buttonLabel} ${title}`}
        onPress={busy ? undefined : onPress}
        style={[styles.soft, busy && { opacity: 0.6 }]}
      >
        {busy ? <ActivityIndicator color={colors.greenDark} /> : <Text style={styles.softText}>{buttonLabel}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 92, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  boxEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#8DB09E' },
  boxDone: { backgroundColor: colors.mint },
  boxText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.green, textAlign: 'center' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarEmpty: { backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.greenDark },
  cardTitle: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  cardHelp: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  soft: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  softText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.greenDark },
});
