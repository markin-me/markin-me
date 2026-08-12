import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PaddleOcrService, V5_CYRILLIC_MOBILE_MODEL } from 'ppu-paddle-ocr/mobile';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { theme } from '../../shared/config/theme';
import { AppText as Text, BottomSheet, Screen } from '../../shared/ui';

type ExpenseDocumentsPageProps = {
  onClose: () => void;
};

type ParsedExpenseDocument = {
  date: string;
  documentNumber: string;
  documentType: string;
  inn: string;
  items: string;
  supplier: string;
  total: string;
};

const emptyDocument: ParsedExpenseDocument = {
  date: '',
  documentNumber: '',
  documentType: 'Не определён',
  inn: '',
  items: '',
  supplier: '',
  total: '',
};

function ensureAbortSignalTimeout() {
  const signal = AbortSignal as unknown as { timeout?: (milliseconds: number) => AbortSignal };
  if (typeof signal.timeout === 'function') return;
  signal.timeout = (milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  };
}

function normalizeAmount(value: string) {
  return value.replace(/\s/g, '').replace(',', '.');
}

function parseExpenseDocument(source: string): ParsedExpenseDocument {
  const lines = source.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const normalized = lines.join('\n');
  const supplier = lines.find((line) => /\b(ООО|ОАО|ПАО|АО|ЗАО|ИП|НКО|ГУП|МУП|Самозанятый|Индивидуальный предприниматель)\b/i.test(line)) || '';
  const inn = normalized.match(/\bИНН\s*[:№#]?\s*(\d{10,12})\b/i)?.[1] || '';
  const date = normalized.match(/(?:\bдата\b|\bот\b)?\s*(\d{2}[./-]\d{2}[./-](?:20)?\d{2})/i)?.[1] || '';
  const documentNumber = normalized.match(/(?:сч[её]т(?:-фактура)?|накладн(?:ая|ой)|чек)\s*(?:№|N|No|#)\s*([A-Za-zА-Яа-я0-9/-]+)/i)?.[1] || '';
  const totalMatches = [...normalized.matchAll(/(?:итого|всего(?:\s+к\s+оплате)?|к\s+оплате|сумма)\D{0,24}(\d[\d\s]*[,.]\d{2})/gi)];
  const total = totalMatches.length ? normalizeAmount(totalMatches[totalMatches.length - 1][1]) : '';
  const documentType = /сч[её]т[ -]?фактура/i.test(normalized)
    ? 'Счёт-фактура'
    : /товарн(?:ая|ой)\s+накладн/i.test(normalized)
      ? 'Товарная накладная'
      : /товарн(?:ый|ого)\s+чек/i.test(normalized)
        ? 'Товарный чек'
        : /кассовый|фискальн(?:ый|ого)\s+чек/i.test(normalized)
          ? 'Кассовый чек'
          : 'Не определён';
  const items = lines
    .filter((line) => /\d[\d\s]*[,.]\d{2}/.test(line) && !/^(итого|всего|к оплате|сумма|ндс|инн|кпп)/i.test(line))
    .slice(0, 30)
    .join('\n');

  return { date, documentNumber, documentType, inn, items, supplier, total };
}

export function ExpenseDocumentsPage({ onClose }: ExpenseDocumentsPageProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const ocrRef = useRef<PaddleOcrService | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [imageUri, setImageUri] = useState('');
  const [recognizedText, setRecognizedText] = useState('');
  const [document, setDocument] = useState<ParsedExpenseDocument>(emptyDocument);
  const [status, setStatus] = useState<'idle' | 'recognizing'>('idle');
  const [error, setError] = useState('');

  const recognizeDocument = async (scannedUri: string) => {
    setImageUri(scannedUri);
    setRecognizedText('');
    setDocument(emptyDocument);
    setStatus('recognizing');
    try {
      if (!ocrRef.current) {
        ensureAbortSignalTimeout();
        ocrRef.current = new PaddleOcrService({ model: V5_CYRILLIC_MOBILE_MODEL });
      }
      if (!ocrRef.current.isInitialized()) await ocrRef.current.initialize();
      const imageResponse = await fetch(scannedUri);
      if (!imageResponse.ok) throw new Error('Не удалось открыть отсканированное изображение.');
      const recognized = await ocrRef.current.recognize(await imageResponse.arrayBuffer());
      const text = recognized.text.trim();
      setRecognizedText(text);
      setDocument(parseExpenseDocument(text));
      if (!text) setError('На фото не удалось найти текст. Попробуйте снять документ при более ярком свете.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось распознать документ.');
    } finally {
      setStatus('idle');
    }
  };

  const openCamera = async () => {
    setError('');
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) {
      setError('Разрешите доступ к камере в настройках телефона, чтобы сфотографировать документ.');
      return;
    }
    setCameraVisible(true);
  };

  const captureDocument = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) throw new Error('Не удалось сделать снимок документа.');
      setCameraVisible(false);
      await recognizeDocument(photo.uri);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось сделать снимок документа.');
    }
  };

  const updateDocument = (field: keyof ParsedExpenseDocument, value: string) => {
    setDocument((current) => ({ ...current, [field]: value }));
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Назад" onPress={onClose} style={styles.headerButton}>
          <Ionicons color={theme.colors.text} name="arrow-back" size={23} />
        </Pressable>
        <Text style={styles.title}>Документы расходов</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          <Ionicons color={theme.colors.accent} name="phone-portrait-outline" size={21} />
          <Text style={styles.noticeText}>Фото и распознавание обрабатываются на этом устройстве.</Text>
        </View>
        <Pressable disabled={status === 'recognizing'} onPress={() => void openCamera()} style={[styles.scanButton, status === 'recognizing' && styles.scanButtonDisabled]}>
          {status === 'recognizing' ? <ActivityIndicator color="#fff" /> : <Ionicons color="#fff" name="camera-outline" size={22} />}
          <Text style={styles.scanButtonText}>{status === 'recognizing' ? 'Распознаём…' : 'Сканировать накладную или чек'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : null}
        {recognizedText || status === 'recognizing' ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Данные документа</Text>
            {status === 'recognizing' ? (
              <Text style={styles.muted}>Первый запуск загружает OCR-модели на телефон.</Text>
            ) : (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Тип документа</Text>
                  <TextInput onChangeText={(value) => updateDocument('documentType', value)} placeholder="Не определён" placeholderTextColor={theme.colors.muted} style={styles.fieldInput} value={document.documentType} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Поставщик</Text>
                  <TextInput onChangeText={(value) => updateDocument('supplier', value)} placeholder="Название поставщика" placeholderTextColor={theme.colors.muted} style={styles.fieldInput} value={document.supplier} />
                </View>
                <View style={styles.twoColumns}>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>ИНН</Text>
                    <TextInput keyboardType="number-pad" onChangeText={(value) => updateDocument('inn', value)} placeholder="Не найден" placeholderTextColor={theme.colors.muted} style={styles.fieldInput} value={document.inn} />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Сумма, ₽</Text>
                    <TextInput keyboardType="decimal-pad" onChangeText={(value) => updateDocument('total', value)} placeholder="0.00" placeholderTextColor={theme.colors.muted} style={styles.fieldInput} value={document.total} />
                  </View>
                </View>
                <View style={styles.twoColumns}>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Дата документа</Text>
                    <TextInput onChangeText={(value) => updateDocument('date', value)} placeholder="ДД.ММ.ГГГГ" placeholderTextColor={theme.colors.muted} style={styles.fieldInput} value={document.date} />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={styles.label}>Номер</Text>
                    <TextInput onChangeText={(value) => updateDocument('documentNumber', value)} placeholder="Не найден" placeholderTextColor={theme.colors.muted} style={styles.fieldInput} value={document.documentNumber} />
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Позиции</Text>
                  <TextInput multiline onChangeText={(value) => updateDocument('items', value)} placeholder="Товары и услуги" placeholderTextColor={theme.colors.muted} style={[styles.fieldInput, styles.itemsInput]} value={document.items} />
                </View>
                <View style={styles.sourceText}>
                  <Text style={styles.label}>Исходный текст OCR</Text>
                  <TextInput multiline onChangeText={setRecognizedText} placeholder="Текст появится здесь" placeholderTextColor={theme.colors.muted} style={styles.input} value={recognizedText} />
                </View>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
      <BottomSheet onClose={() => setCameraVisible(false)} title="Сканирование документа" visible={cameraVisible}>
        {cameraPermission?.granted ? (
          <View style={styles.cameraContent}>
            <CameraView facing="back" onMountError={(event) => setError(`Не удалось открыть камеру: ${event.message}`)} ref={cameraRef} style={styles.camera} />
            <Text style={styles.cameraHint}>Расположите документ целиком в кадре и держите телефон ровно.</Text>
            <Pressable onPress={() => void captureDocument()} style={styles.captureButton}>
              <Ionicons color="#fff" name="camera" size={22} />
              <Text style={styles.captureButtonText}>Сделать фото</Text>
            </Pressable>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16 },
  camera: { borderRadius: theme.radius.md, height: 360, overflow: 'hidden', width: '100%' },
  cameraContent: { gap: 14 },
  cameraHint: { color: theme.colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  captureButton: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.radius.md, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 52, paddingHorizontal: 16 },
  captureButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  error: { color: theme.colors.danger, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  field: { gap: 4 },
  fieldInput: { borderBottomColor: theme.colors.border, borderBottomWidth: 1, color: theme.colors.text, fontSize: 15, minHeight: 34, paddingHorizontal: 0, paddingVertical: 6 },
  header: { alignItems: 'center', borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 56, paddingHorizontal: 10 },
  headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  image: { backgroundColor: theme.colors.mutedBackground, borderRadius: theme.radius.md, height: 260, width: '100%' },
  input: { color: theme.colors.text, fontSize: 15, lineHeight: 22, minHeight: 180, padding: 0, textAlignVertical: 'top' },
  itemsInput: { minHeight: 110, textAlignVertical: 'top' },
  halfField: { flex: 1, gap: 4, minWidth: 0 },
  label: { color: theme.colors.muted, fontSize: 12, fontWeight: '800' },
  muted: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  notice: { alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: theme.radius.md, flexDirection: 'row', gap: 10, padding: 12 },
  noticeText: { color: theme.colors.text, flex: 1, fontSize: 14, lineHeight: 19 },
  resultCard: { borderColor: theme.colors.border, borderRadius: theme.radius.md, borderWidth: 1, gap: 10, padding: 14 },
  resultTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  scanButton: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.radius.md, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 52, paddingHorizontal: 14 },
  scanButtonDisabled: { opacity: 0.72 },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  title: { color: theme.colors.text, flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  sourceText: { borderTopColor: theme.colors.border, borderTopWidth: 1, gap: 4, paddingTop: 12 },
  twoColumns: { flexDirection: 'row', gap: 12 },
});
