import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChatPage } from '../pages/chat';
import { LoginPage } from '../pages/login';
import { clearAdminSession, readAdminSession, type AdminSession } from '../shared/api';
import { theme } from '../shared/config/theme';

export function AppRoot() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    NativeStatusBar.setTranslucent(false);
    NativeStatusBar.setBackgroundColor(theme.colors.background);
    NativeStatusBar.setBarStyle('dark-content');
    void readAdminSession()
      .then(setSession)
      .finally(() => setReady(true));
  }, []);

  const logout = async () => {
    await clearAdminSession();
    setSession(null);
  };

  return (
    <SafeAreaProvider>
      {ready ? (
        session?.token ? (
          <ChatPage onLogout={logout} session={session} />
        ) : (
          <LoginPage onLogin={setSession} />
        )
      ) : (
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )}
      <StatusBar backgroundColor={theme.colors.background} style="dark" translucent={false} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
