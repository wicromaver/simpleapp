import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Shell } from '../components/Shell';
import { StoreProvider } from '../state/store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
