import { forwardRef } from 'react';
import { TextInput as NativeTextInput } from 'react-native';
import type { ComponentRef } from 'react';
import type { TextInputProps } from 'react-native';

export const AppTextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function AppTextInput(props, ref) {
  return <NativeTextInput ref={ref} {...props} allowFontScaling={false} />;
});
