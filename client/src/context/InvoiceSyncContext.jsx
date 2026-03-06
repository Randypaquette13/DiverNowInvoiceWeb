import { createContext, useContext, useState } from 'react';

const InvoiceSyncContext = createContext(null);

export function InvoiceSyncProvider({ children }) {
  const [invoiceSyncPending, setInvoiceSyncPending] = useState(false);
  return (
    <InvoiceSyncContext.Provider value={{ invoiceSyncPending, setInvoiceSyncPending }}>
      {children}
    </InvoiceSyncContext.Provider>
  );
}

export function useInvoiceSync() {
  const ctx = useContext(InvoiceSyncContext);
  if (!ctx) throw new Error('useInvoiceSync must be used within InvoiceSyncProvider');
  return ctx;
}
