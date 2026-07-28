import { VariableContextProvider } from 'react-native-css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyVariableContextProvider({
  children,
}: {
  children: React.JSX.Element;
}) {
  const { top, bottom } = useSafeAreaInsets();
  return (
    <VariableContextProvider
      value={{
        '--safe-top': top,
        '--safe-bottom': bottom,
      }}
    >
      {children}
    </VariableContextProvider>
  );
}
