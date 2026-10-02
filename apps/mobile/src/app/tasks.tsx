import { InsertBar } from '../components/InsertBar';
import { TaskList } from '../components/TaskList';
import { Screen, T } from '../components/ui';

export default function Tasks() {
  return (
    <Screen>
      <InsertBar hint={false} />
      <T size={22} serifFont style={{ marginTop: 4, marginBottom: 12 }}>Tasks</T>
      <TaskList />
    </Screen>
  );
}
