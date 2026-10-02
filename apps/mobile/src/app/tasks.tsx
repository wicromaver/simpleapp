import { TaskList } from '../components/TaskList';
import { Screen, T } from '../components/ui';

export default function Tasks() {
  return (
    <Screen>
      <T size={22} weight="500" serifFont style={{ marginTop: 10, marginBottom: 18 }}>Tasks</T>
      <TaskList />
    </Screen>
  );
}
