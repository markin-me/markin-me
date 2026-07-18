import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { loginAdmin, type AdminSession } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { AppText as Text, Screen } from '../../shared/ui';

type LoginPageProps = {
  onLogin: (session: AdminSession) => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const safeEmail = email.trim();
    if (!safeEmail || !password) {
      setError('Введите email и пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await loginAdmin(safeEmail, password);
      onLogin(session);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.root}>
        <Text style={styles.title}>Вход в админ-чат</Text>
        <TextInput
          allowFontScaling={false}
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#8f8f95"
          style={styles.input}
          value={email}
        />
        <TextInput
          allowFontScaling={false}
          onChangeText={setPassword}
          placeholder="Пароль"
          placeholderTextColor="#8f8f95"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading} onPress={submit} style={[styles.button, loading && styles.buttonDisabled]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  root: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
});
