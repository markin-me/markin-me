import { Image, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../../shared/config/theme';
import { AppText as Text } from '../../../shared/ui';

export type ChatPickedImage = {
  name: string;
  type: string;
  uri: string;
};

type ChatAttachmentPreviewProps = {
  caption: string;
  images: ChatPickedImage[];
  onCancel: () => void;
  onChangeCaption: (caption: string) => void;
  onSend: () => void;
  visible: boolean;
};

export function ChatAttachmentPreview({
  caption,
  images,
  onCancel,
  onChangeCaption,
  onSend,
  visible,
}: ChatAttachmentPreviewProps) {
  const first = images[0];

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.host}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.iconButton}>
              <Ionicons color="#111827" name="close" size={22} />
            </Pressable>
            <Text style={styles.title}>{images.length === 1 ? '1 фотография' : `${images.length} фотографий`}</Text>
          </View>
          {first ? <Image source={{ uri: first.uri }} style={styles.image} /> : null}
          {images.length > 1 ? (
            <View style={styles.thumbs}>
              {images.slice(0, 6).map((image) => (
                <Image key={image.uri} source={{ uri: image.uri }} style={styles.thumb} />
              ))}
            </View>
          ) : null}
          <View style={styles.foot}>
            <TextInput
              allowFontScaling={false}
              onChangeText={onChangeCaption}
              placeholder="Добавить подпись..."
              placeholderTextColor="#8f8f95"
              style={styles.caption}
              value={caption}
            />
            <Pressable accessibilityRole="button" onPress={onSend} style={styles.send}>
              <Ionicons color="#fff" name="paper-plane" size={19} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    maxHeight: '88%',
    padding: 12,
    width: '92%',
  },
  foot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  host: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.44)',
    flex: 1,
    justifyContent: 'center',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  image: {
    aspectRatio: 1,
    backgroundColor: '#e5e7eb',
    borderRadius: 14,
    width: '100%',
  },
  send: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  thumb: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  thumbs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
});
