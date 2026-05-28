import { StatusBar } from 'expo-status-bar';
import { HomePage } from '../pages/home';

export function AppRoot() {
  return (
    <>
      <HomePage />
      <StatusBar style="auto" />
    </>
  );
}
