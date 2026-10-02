// Fonts ship inside the app bundle (assets/fonts, SIL Open Font License). Nothing is
// fetched from the network, so text renders the same offline.
import type { TextStyle } from 'react-native';

export const FONT_FILES = {
  'Inter-Regular': require('../assets/fonts/Inter_400Regular.ttf'),
  'Inter-Medium': require('../assets/fonts/Inter_500Medium.ttf'),
  'Inter-SemiBold': require('../assets/fonts/Inter_600SemiBold.ttf'),
  'Newsreader-Medium': require('../assets/fonts/Newsreader_500Medium.ttf'),
};

export type Weight = '400' | '500' | '600';

/** Custom fonts are one family per weight; never combine them with fontWeight. */
export function font(weight: Weight = '400', serif = false): Pick<TextStyle, 'fontFamily'> {
  if (serif) return { fontFamily: 'Newsreader-Medium' };
  return { fontFamily: weight === '600' ? 'Inter-SemiBold' : weight === '500' ? 'Inter-Medium' : 'Inter-Regular' };
}
