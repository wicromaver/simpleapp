import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/auth';
import { Shell } from '../components/Shell';
import { StoreProvider } from '../state/store';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
