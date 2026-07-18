import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { ChatTabParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { ChatMessagesPage } from './ChatMessagesPage';
import { ChatPage } from './ChatPage';
import { ImportantMessageDetailsPage } from './ImportantMessageDetailsPage';
import { ImportantMessagesPage } from './ImportantMessagesPage';

const ChatStack = createNativeStackNavigator<ChatTabParamList>();

export function ChatTabNavigator() {
  return (
    <ChatStack.Navigator initialRouteName="chatHome" screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="chatHome" component={ChatMessagesPage} />
      <ChatStack.Screen name={routes.importantMessages} component={ImportantMessagesPage} />
      <ChatStack.Screen name={routes.importantMessageDetails} component={ImportantMessageDetailsPage} />
      <ChatStack.Screen name={routes.supportChat} component={ChatPage} />
    </ChatStack.Navigator>
  );
}
