import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ChatImageViewerProps = {
  onClose: () => void;
  uri: string;
};

export function ChatImageViewer({ onClose, uri }: ChatImageViewerProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={!!uri}>
      <View style={styles.host}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Ionicons color="#fff" name="close" size={24} />
        </Pressable>
        {uri ? <Image resizeMode="contain" source={{ uri }} style={styles.image} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  close: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    top: 50,
    width: 44,
    zIndex: 2,
  },
  host: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
    flex: 1,
    justifyContent: 'center',
  },
  image: {
    height: '92%',
    width: '96%',
  },
});
