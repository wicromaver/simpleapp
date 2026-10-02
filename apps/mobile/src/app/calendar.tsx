import { CalendarHeader, DayView, MonthView, WeekView } from '../components/Calendar';
import { Screen } from '../components/ui';
import { useStore } from '../state/store';

export default function Calendar() {
  const { calView, viewDate } = useStore();
  return (
    <Screen scroll={calView !== 'day'}>
      <CalendarHeader />
      {calView === 'day' && <DayView date={viewDate} />}
      {calView === 'week' && <WeekView date={viewDate} />}
      {calView === 'month' && <MonthView date={viewDate} />}
    </Screen>
  );
}
