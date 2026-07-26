import { Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '../../../shared/ui';

const DEFAULT_PROMPT = 'Чтобы я смог вам помочь, выберите категорию ниже:';

type ChatQuickQuestionsProps = {
  onPress: (question: string) => void;
  prompt?: string;
  questions: string[];
  timeLabel?: string;
  visible: boolean;
};

export function ChatQuickQuestions({ onPress, prompt = DEFAULT_PROMPT, questions, timeLabel, visible }: ChatQuickQuestionsProps) {
  if (!visible || !questions.length) return null;

  return (
    <View style={styles.row}>
      <View style={styles.root}>
        <Text style={styles.prompt}>{prompt}</Text>
        <View style={styles.list}>
          {questions.map((question) => (
            <Pressable accessibilityRole="button" key={question} onPress={() => onPress(question)} style={styles.button}>
              <Text style={styles.text}>{question}</Text>
            </Pressable>
          ))}
        </View>
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#fffdf9',
    borderColor: 'rgba(244,155,61,0.42)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  list: {
    gap: 8,
  },
  prompt: {
    color: '#2f3137',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 10,
  },
  root: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 0,
    borderRadius: 18,
    maxWidth: 360,
    overflow: 'hidden',
    paddingBottom: 30,
    paddingHorizontal: 14,
    paddingTop: 12,
    width: '90%',
  },
  row: {
    alignItems: 'flex-start',
    marginTop: 2,
    width: '100%',
  },
  text: {
    color: '#2f3137',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  time: {
    bottom: 8,
    color: '#a5a5ab',
    fontSize: 12,
    position: 'absolute',
    right: 12,
  },
});
