import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

const PHONE_WIDTH = 430;

/**
 * Desktop preview only. On a wide browser window the app is shown as a centred, phone-width column on a
 * soft background so every screen keeps its designed layout. Phones and narrow windows are unchanged.
 */
export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width <= PHONE_WIDTH + 40) return <>{children}</>;
  return (
    <View style={styles.backdrop}>
      <View style={styles.phone}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#DCE6E1', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  phone: {
    flex: 1,
    width: PHONE_WIDTH,
    maxWidth: '100%',
    maxHeight: 900,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#F7F7F4',
    borderWidth: 1,
    borderColor: '#C3D2CB',
  },
});
