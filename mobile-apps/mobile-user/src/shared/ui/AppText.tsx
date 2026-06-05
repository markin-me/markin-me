import { forwardRef } from 'react';
import { Text as NativeText } from 'react-native';
import type { ComponentRef } from 'react';
import type { TextProps } from 'react-native';

export const AppText = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function AppText(props, ref) {
  return <NativeText ref={ref} {...props} allowFontScaling={false} />;
});
