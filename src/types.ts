export interface Ledger {
  id: number;
  name: string;
  icon: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  ledger_id: number | null;
}

export interface Transaction {
  id: number;
  ledger_id: number;
  category_id: number;
  category_name: string;
  category_icon: string;
  amount: number;
  type: 'expense' | 'income';
  note: string;
  date: string;
  created_at: string;
}
