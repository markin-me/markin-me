import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { ChatTabParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { ChatMessagesPage } from './ChatMessagesPage';
import { ImportantMessageDetailsPage } from './ImportantMessageDetailsPage';
import { ImportantMessagesPage } from './ImportantMessagesPage';

const ChatStack = createNativeStackNavigator<ChatTabParamList>();

type ChatTabNavigatorProps = {
  onOpenSupportChat?: () => void;
};

export function ChatTabNavigator({ onOpenSupportChat }: ChatTabNavigatorProps = {}) {
  return (
    <ChatStack.Navigator initialRouteName="chatHome" screenOptions={{ gestureEnabled: true, headerShown: false }}>
      <ChatStack.Screen name="chatHome">
        {() => <ChatMessagesPage onOpenSupportChat={onOpenSupportChat} />}
      </ChatStack.Screen>
      <ChatStack.Screen name={routes.importantMessages} component={ImportantMessagesPage} />
      <ChatStack.Screen name={routes.importantMessageDetails} component={ImportantMessageDetailsPage} />
    </ChatStack.Navigator>
  );
}
