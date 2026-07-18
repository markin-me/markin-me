import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

import {
  getOrderCardMeta,
  getOrderCardPhotos,
  getOrderCardStatus,
  getOrderCardTitle,
  getOrderCardTotal,
  resolveChatAssetUrl,
  type ChatOrderCard,
} from '../../../features/chat';
import { AppText as Text } from '../../../shared/ui';

type ChatOrderCardsProps = {
  cards: ChatOrderCard[];
  onOpen?: (card: ChatOrderCard) => void;
};

export function ChatOrderCards({ cards, onOpen }: ChatOrderCardsProps) {
  if (!cards.length) return null;

  return (
    <FlatList
      data={cards}
      horizontal
      keyExtractor={(card, index) => String(card.id || index)}
      showsHorizontalScrollIndicator={false}
      style={styles.list}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item: card, index }) => {
        const status = getOrderCardStatus(card);
        const total = getOrderCardTotal(card);
        const meta = getOrderCardMeta(card);
        const photos = getOrderCardPhotos(card);
        return (
          <Pressable
            accessibilityRole="button"
            key={`${card.id || index}`}
            onPress={() => onOpen?.(card)}
            style={styles.card}
          >
            <View style={styles.cardHead}>
              <Text numberOfLines={1} style={styles.title}>{getOrderCardTitle(card)}</Text>
              {status ? <Text numberOfLines={1} style={styles.status}>{status}</Text> : null}
            </View>
            {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
            {total ? <Text numberOfLines={1} style={styles.total}>{total}</Text> : null}
            {photos.length ? (
              <View style={styles.photos}>
                {photos.map((photo, photoIndex) => (
                  <Image key={`${photo}-${photoIndex}`} source={{ uri: resolveChatAssetUrl(photo) }} style={styles.photo} />
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    gap: 4,
    maxWidth: 184,
    minHeight: 104,
    minWidth: 184,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 8,
    width: 184,
  },
  cardHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'stretch',
    paddingRight: 2,
  },
  list: {
    flexGrow: 0,
    marginTop: 10,
    maxHeight: 116,
    maxWidth: '100%',
  },
  meta: {
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 14,
  },
  photo: {
    backgroundColor: '#e5e7eb',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    width: 34,
  },
  photos: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  separator: {
    width: 8,
  },
  status: {
    color: '#f97316',
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 74,
    textAlign: 'right',
  },
  title: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  total: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
});
