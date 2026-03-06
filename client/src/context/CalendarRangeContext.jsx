import { createContext, useContext, useState } from 'react';

const CalendarRangeContext = createContext(null);

export function CalendarRangeProvider({ children }) {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  return (
    <CalendarRangeContext.Provider value={{ from, setFrom, to, setTo }}>
      {children}
    </CalendarRangeContext.Provider>
  );
}

export function useCalendarRange() {
  const ctx = useContext(CalendarRangeContext);
  if (!ctx) throw new Error('useCalendarRange must be used within CalendarRangeProvider');
  return ctx;
}
