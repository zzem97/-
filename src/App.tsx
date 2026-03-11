import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  LayoutGrid, 
  PieChart, 
  User, 
  ChevronDown, 
  Utensils, 
  Car, 
  ShoppingBag, 
  Gamepad2, 
  Banknote, 
  TrendingUp,
  Trash2,
  Calendar as CalendarIcon,
  Download,
  Wallet,
  Home,
  Heart,
  Settings,
  PlusCircle,
  X,
  Search,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, parseISO, isSameDay, startOfYear, eachMonthOfInterval } from 'date-fns';
import { toPng } from 'html-to-image';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { Ledger, Category, Transaction } from './types';
import { cn } from './lib/utils';

const ICON_MAP: Record<string, any> = {
  Utensils, Car, ShoppingBag, Gamepad2, Banknote, TrendingUp, Wallet, Home, Heart, LayoutGrid, User
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'stats' | 'profile'>('home');
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [currentLedger, setCurrentLedger] = useState<Ledger | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLedgerSelector, setShowLedgerSelector] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showStatement, setShowStatement] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<'month' | 'year'>('month');
  const statsRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLedgers();
  }, []);

  useEffect(() => {
    fetchCategories();
    if (currentLedger) {
      fetchTransactions();
    }
  }, [currentLedger]);

  const fetchLedgers = async () => {
    const res = await fetch('/api/ledgers');
    const data = await res.json();
    setLedgers(data);
    if (data.length > 0 && !currentLedger) {
      const pocketLedger = data.find((l: Ledger) => l.name === '小金库');
      setCurrentLedger(pocketLedger || data[0]);
    }
  };

  const fetchCategories = async () => {
    const url = currentLedger ? `/api/categories?ledger_id=${currentLedger.id}` : '/api/categories';
    const res = await fetch(url);
    const data = await res.json();
    setCategories(data);
  };

  const fetchTransactions = async () => {
    if (!currentLedger) return;
    const res = await fetch(`/api/transactions?ledger_id=${currentLedger.id}`);
    const data = await res.json();
    setTransactions(data);
  };

  const startEditing = (t: Transaction) => {
    setEditingTransaction(t);
    setFormType(t.type);
    setAmount(t.amount.toString());
    setNote(t.note || '');
    setDate(t.date);
    const cat = categories.find(c => c.id === t.category_id);
    setSelectedCategory(cat || null);
    setShowAddModal(true);
  };

  const totals = transactions.filter(t => {
    const date = parseISO(t.date);
    return date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
  }).reduce((acc, t) => {
    if (t.type === 'income') acc.income += t.amount;
    else acc.expense += t.amount;
    return acc;
  }, { income: 0, expense: 0 });

  const annualTotals = transactions.filter(t => {
    const year = new Date(t.date).getFullYear();
    return year === new Date().getFullYear();
  }).reduce((acc, t) => {
    if (t.type === 'income') acc.income += t.amount;
    else acc.expense += t.amount;
    return acc;
  }, { income: 0, expense: 0 });

  const filteredTransactions = transactions.filter(t => 
    t.category_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.note && t.note.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const groupedTransactions = filteredTransactions.reduce((acc: Record<string, Transaction[]>, t) => {
    const date = t.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

  const handleAddLedger = () => {
    setShowLedgerModal(true);
    setShowLedgerSelector(false);
  };

  const createLedger = async (name: string, type: string) => {
    const res = await fetch('/api/ledgers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, icon: 'LayoutGrid' }),
    });
    const data = await res.json();
    await fetchLedgers();
    const newLedger = { id: data.id, name, icon: 'LayoutGrid' };
    setCurrentLedger(newLedger as Ledger);
    setShowLedgerModal(false);
  };
  const handleAddTransaction = async (data: any) => {
    if (editingTransaction) {
      await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, ledger_id: currentLedger?.id }),
      });
    }
    fetchTransactions();
    setShowAddModal(false);
    setEditingTransaction(null);
    setAmount('');
    setSelectedCategory(null);
    setNote('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleDeleteTransaction = async (id: number) => {
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    fetchTransactions();
  };

  const handleExport = () => {
    if (!currentLedger) return;
    window.open(`/api/export?ledger_id=${currentLedger.id}`);
  };

  const handleExportStats = async () => {
    if (statsRef.current) {
      const dataUrl = await toPng(statsRef.current, { backgroundColor: '#f5f5f5', quality: 1 });
      const link = document.createElement('a');
      link.download = `stats-${format(new Date(), 'yyyyMMdd')}.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  const monthlyData = eachMonthOfInterval({
    start: startOfYear(new Date()),
    end: new Date()
  }).map(month => {
    const monthStr = format(month, 'yyyy-MM');
    const monthTransactions = transactions.filter(t => t.date.startsWith(monthStr));
    const income = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { month: format(month, 'MM月'), income, expense, balance: income - expense };
  }).reverse();

  const [formType, setFormType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!showAddModal) {
      setEditingTransaction(null);
      setAmount('');
      setSelectedCategory(null);
      setNote('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setIsAddingCategory(false);
    }
  }, [showAddModal]);

  return (
    <div className="min-h-screen pb-24 max-w-md mx-auto bg-background relative overflow-hidden">
      {/* Header */}
      <header className="bg-white px-4 pt-8 pb-4 sticky top-0 z-40 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowLedgerSelector(!showLedgerSelector)}
              className="flex items-center gap-1 text-lg font-medium text-primary"
            >
              {currentLedger?.name || '选择账本'}
              <ChevronDown size={20} className={cn("transition-transform", showLedgerSelector && "rotate-180")} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">{format(new Date(), 'yyyy年MM月')}</div>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="关键字搜索明细"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-100 border border-gray-200 rounded-xl py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {showLedgerSelector && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 bg-white border-t shadow-lg z-50 p-2"
            >
              <div className="max-h-60 overflow-y-auto">
                {ledgers.map(l => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setCurrentLedger(l);
                      setShowLedgerSelector(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-lg flex items-center gap-3",
                      currentLedger?.id === l.id ? "bg-primary/10 text-primary" : "hover:bg-gray-50"
                    )}
                  >
                    {ICON_MAP[l.icon] && React.createElement(ICON_MAP[l.icon], { size: 18 })}
                    {l.name}
                  </button>
                ))}
              </div>
              <button 
                onClick={handleAddLedger}
                className="w-full mt-2 p-3 flex items-center justify-center gap-2 text-primary font-medium hover:bg-primary/5 rounded-lg border border-dashed border-primary/30"
              >
                <Plus size={18} />
                新增账本
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="p-4 space-y-4">
        {activeTab === 'home' && (
          <>
            {/* Summary Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#7B62BE] to-[#8B72CE] p-6 text-white shadow-2xl shadow-primary/30">
              <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-black/10 blur-2xl" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 opacity-80">
                    <Wallet size={14} />
                    <span className="text-xs font-medium tracking-wide uppercase">本月结余</span>
                  </div>
                  <button 
                    onClick={() => setShowStatement(true)}
                    className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[10px] font-medium backdrop-blur-md hover:bg-white/30 transition-all"
                  >
                    明细账单 <ChevronDown size={10} className="-rotate-90" />
                  </button>
                </div>
                
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-xl font-medium opacity-70">¥</span>
                  <span className="text-4xl font-bold tracking-tight">{(totals.income - totals.expense).toLocaleString()}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/70 uppercase tracking-wider">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      本月收入
                    </div>
                    <div className="text-lg font-bold">¥ {totals.income.toLocaleString()}</div>
                  </div>
                  <div className="space-y-1 border-l border-white/10 pl-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/70 uppercase tracking-wider">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      本月支出
                    </div>
                    <div className="text-lg font-bold">¥ {totals.expense.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between px-1 opacity-60">
                  <span className="text-[10px] font-medium uppercase tracking-widest">年度累计结余</span>
                  <span className="text-xs font-bold font-mono">¥ {(annualTotals.income - annualTotals.expense).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Transaction List */}
            <div className="space-y-8">
              {sortedDates.map(date => (
                <div key={date} className="relative">
                  <div className="sticky top-[140px] z-10 -mx-4 bg-background/80 px-4 py-2 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-primary/30" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{date}</span>
                      </div>
                      <div className="flex gap-3 text-[10px] font-medium text-gray-400">
                        {groupedTransactions[date].some(t => t.type === 'income') && (
                          <span className="flex items-center gap-1">
                            <span className="h-1 w-1 rounded-full bg-emerald-500" />
                            收: {groupedTransactions[date].filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toLocaleString()}
                          </span>
                        )}
                        {groupedTransactions[date].some(t => t.type === 'expense') && (
                          <span className="flex items-center gap-1">
                            <span className="h-1 w-1 rounded-full bg-red-500" />
                            支: {groupedTransactions[date].filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 space-y-3">
                    {groupedTransactions[date].map((t) => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={t.id} 
                        onClick={() => startEditing(t)}
                        className="group relative flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.98] cursor-pointer"
                      >
                        <div className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-2xl transition-colors",
                          t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-600"
                        )}>
                          {ICON_MAP[t.category_icon] && React.createElement(ICON_MAP[t.category_icon], { size: 22 })}
                        </div>
                        
                        <div className="flex-1 overflow-hidden">
                          <div className="truncate font-bold text-gray-800">{t.category_name}</div>
                          {t.note && (
                            <div className="truncate text-[10px] text-gray-400 mt-0.5 font-medium">{t.note}</div>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          <div className={cn(
                            "text-base font-bold font-mono",
                            t.type === 'income' ? "text-emerald-600" : "text-gray-900"
                          )}>
                            {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}
                          </div>
                          <div className="text-[9px] font-bold text-gray-300 uppercase tracking-tighter">
                            {t.type === 'income' ? 'Income' : 'Expense'}
                          </div>
                        </div>

                        <button 
                          onClick={() => handleDeleteTransaction(t.id)}
                          className="absolute -right-2 -top-2 flex h-8 w-8 scale-0 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all group-hover:scale-100 hover:bg-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
              {sortedDates.length === 0 && (
                <div className="py-20 text-center text-gray-400">
                  <div className="mb-2">暂无明细</div>
                  <div className="text-xs">点击下方 + 开始记账吧</div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6 pb-20" ref={statsRef}>
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-gray-800">财务统计</h2>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setStatsPeriod('month')}
                    className={cn(
                      "px-3 py-1 text-xs rounded-md transition-all",
                      statsPeriod === 'month' ? "bg-white shadow-sm text-primary font-bold" : "text-gray-400"
                    )}
                  >月</button>
                  <button 
                    onClick={() => setStatsPeriod('year')}
                    className={cn(
                      "px-3 py-1 text-xs rounded-md transition-all",
                      statsPeriod === 'year' ? "bg-white shadow-sm text-primary font-bold" : "text-gray-400"
                    )}
                  >年</button>
                </div>
              </div>
              <button 
                onClick={handleExportStats}
                className="flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
              >
                <Share2 size={14} />
                导出长图
              </button>
            </div>

            {/* Summary Row */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center space-y-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">总收入</div>
                  <div className="text-lg font-bold text-red-500 font-mono">
                    ¥{(() => {
                      const periodTransactions = transactions.filter(t => {
                        const date = parseISO(t.date);
                        if (statsPeriod === 'month') {
                          return date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
                        } else {
                          return date >= startOfYear(new Date());
                        }
                      });
                      return periodTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toLocaleString();
                    })()}
                  </div>
                </div>
                <div className="text-center space-y-1 border-x border-gray-50">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">总支出</div>
                  <div className="text-lg font-bold text-green-500 font-mono">
                    ¥{(() => {
                      const periodTransactions = transactions.filter(t => {
                        const date = parseISO(t.date);
                        if (statsPeriod === 'month') {
                          return date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
                        } else {
                          return date >= startOfYear(new Date());
                        }
                      });
                      return periodTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toLocaleString();
                    })()}
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">结余</div>
                  <div className="text-lg font-bold text-black font-mono">
                    ¥{(() => {
                      const periodTransactions = transactions.filter(t => {
                        const date = parseISO(t.date);
                        if (statsPeriod === 'month') {
                          return date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
                        } else {
                          return date >= startOfYear(new Date());
                        }
                      });
                      const inc = periodTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                      const exp = periodTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                      return (inc - exp).toLocaleString();
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Expense Categories */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-medium mb-4 text-gray-500">支出分类</h3>
              <div className="flex items-center gap-4">
                <div className="h-40 w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={Object.values(transactions.filter(t => {
                          const date = parseISO(t.date);
                          const isExpense = t.type === 'expense';
                          if (statsPeriod === 'month') {
                            return isExpense && date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
                          } else {
                            return isExpense && date >= startOfYear(new Date());
                          }
                        }).reduce((acc: any, t) => {
                          if (!acc[t.category_name]) acc[t.category_name] = { name: t.category_name, value: 0 };
                          acc[t.category_name].value += t.amount;
                          return acc;
                        }, {}))}
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {['#6B52AE', '#8B72CE', '#AB92EE', '#CBB2FF', '#EBD2FF'].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3">
                  {(() => {
                    const data = Object.values(transactions.filter(t => {
                      const date = parseISO(t.date);
                      const isExpense = t.type === 'expense';
                      if (statsPeriod === 'month') {
                        return isExpense && date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
                      } else {
                        return isExpense && date >= startOfYear(new Date());
                      }
                    }).reduce((acc: any, t) => {
                      if (!acc[t.category_name]) acc[t.category_name] = { name: t.category_name, value: 0 };
                      acc[t.category_name].value += t.amount;
                      return acc;
                    }, {})) as any[];
                    const total = data.reduce((sum, item) => sum + item.value, 0);
                    const colors = ['#6B52AE', '#8B72CE', '#AB92EE', '#CBB2FF', '#EBD2FF'];
                    
                    if (data.length === 0) return <div className="text-center text-gray-400 text-xs py-10">暂无支出</div>;

                    return data.sort((a, b) => b.value - a.value).map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                          <span className="text-gray-600 truncate max-w-[60px]">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">¥{item.value.toLocaleString()}</span>
                          <span className="text-gray-400 w-8 text-right">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Income Categories */}
            {(() => {
              const incomeData = Object.values(transactions.filter(t => {
                const date = parseISO(t.date);
                const isIncome = t.type === 'income';
                if (statsPeriod === 'month') {
                  return isIncome && date >= startOfMonth(new Date()) && date <= endOfMonth(new Date());
                } else {
                  return isIncome && date >= startOfYear(new Date());
                }
              }).reduce((acc: any, t) => {
                if (!acc[t.category_name]) acc[t.category_name] = { name: t.category_name, value: 0 };
                acc[t.category_name].value += t.amount;
                return acc;
              }, {})) as any[];

              if (incomeData.length === 0) return null;

              return (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <h3 className="text-sm font-medium mb-4 text-gray-500">收入分类</h3>
                  <div className="flex items-center gap-4">
                    <div className="h-40 w-1/2">
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={incomeData}
                            innerRadius={40}
                            outerRadius={60}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'].map((color, index) => (
                              <Cell key={`cell-${index}`} fill={color} />
                            ))}
                          </Pie>
                        </RePieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-3">
                      {(() => {
                        const total = incomeData.reduce((sum, item) => sum + item.value, 0);
                        const colors = ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5'];
                        
                        return incomeData.sort((a, b) => b.value - a.value).map((item, idx) => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                              <span className="text-gray-600 truncate max-w-[60px]">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-medium">¥{item.value.toLocaleString()}</span>
                              <span className="text-gray-400 w-8 text-right">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-medium mb-4 text-gray-500">月度概览</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-50">
                      <th className="text-left py-2 font-medium">月份</th>
                      <th className="text-right py-2 font-medium">收入</th>
                      <th className="text-right py-2 font-medium">支出</th>
                      <th className="text-right py-2 font-medium">结余</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 font-medium">{row.month}</td>
                        <td className="text-right py-3 text-income">+{row.income.toLocaleString()}</td>
                        <td className="text-right py-3 text-gray-800">-{row.expense.toLocaleString()}</td>
                        <td className={cn("text-right py-3 font-semibold", row.balance >= 0 ? "text-income" : "text-red-500")}>
                          {row.balance > 0 ? '+' : ''}{row.balance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <User size={32} />
              </div>
              <div>
                <div className="font-bold text-lg">小金库用户</div>
                <div className="text-xs text-gray-400">极简记账，懂你所想</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <button 
                onClick={handleExport}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 border-b border-gray-50"
              >
                <div className="flex items-center gap-3">
                  <Download size={18} className="text-primary" />
                  <span className="text-sm">导出 Excel 报表</span>
                </div>
              </button>
              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-50 border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <LayoutGrid size={18} className="text-primary" />
                  <span className="text-sm">账本管理</span>
                </div>
              </button>
              <button className="w-full p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <Settings size={18} className="text-primary" />
                  <span className="text-sm">设置</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-md border-t border-gray-100 px-6 py-3 flex justify-between items-center z-40">
        <button 
          onClick={() => setActiveTab('home')}
          className={cn("flex flex-col items-center gap-1", activeTab === 'home' ? "text-primary" : "text-gray-400")}
        >
          <LayoutGrid size={22} />
          <span className="text-[10px]">明细</span>
        </button>
        
        <div className="flex flex-col items-center -mt-10">
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/30 border-4 border-background"
            aria-label="收支登记"
            title="收支登记"
          >
            <Plus size={28} />
          </button>
          <span className="text-[10px] text-primary font-bold mt-1">记账</span>
        </div>

        <button 
          onClick={() => setActiveTab('stats')}
          className={cn("flex flex-col items-center gap-1", activeTab === 'stats' ? "text-primary" : "text-gray-400")}
        >
          <PieChart size={22} />
          <span className="text-[10px]">统计</span>
        </button>
      </nav>

      {/* Statement View Modal */}
      <AnimatePresence>
        {showStatement && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-50 bg-background flex flex-col max-w-md mx-auto"
          >
            <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-white sticky top-0 z-10">
              <button onClick={() => setShowStatement(false)} className="p-2 -ml-2 text-gray-400">
                <ChevronDown size={24} />
              </button>
              <h2 className="text-lg font-bold">账单明细</h2>
              <button 
                onClick={handleExport}
                className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full"
              >
                <Share2 size={14} />
                导出Excel
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-8 pb-10">
              {sortedDates.map(date => {
                const items = groupedTransactions[date];
                return (
                  <div key={date} className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <div className="text-xs font-bold text-gray-400">{date}</div>
                      <div className="text-[10px] text-gray-300">
                        收: {items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0)} 
                        支: {items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)}
                      </div>
                    </div>

                    <div className="relative">
                      {/* Vertical divider line */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-100 -translate-x-1/2" />
                      
                      <div className="space-y-4">
                        {items.map((t) => (
                          <div 
                            key={t.id} 
                            className="grid grid-cols-2 gap-8 relative cursor-pointer group"
                            onClick={() => {
                              setShowStatement(false);
                              startEditing(t);
                            }}
                          >
                            {t.type === 'income' ? (
                              <div className="col-start-1 text-left">
                                <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-50 inline-block min-w-[120px]">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-6 h-6 rounded-full bg-income/10 text-income flex items-center justify-center">
                                      {ICON_MAP[t.category_icon] && React.createElement(ICON_MAP[t.category_icon], { size: 12 })}
                                    </div>
                                    <span className="text-xs font-medium">{t.category_name}</span>
                                  </div>
                                  <div className="text-sm font-bold text-income">+{t.amount.toLocaleString()}</div>
                                  {t.note && <div className="text-[10px] text-gray-400 mt-1">{t.note}</div>}
                                </div>
                              </div>
                            ) : (
                              <div className="col-start-2 text-right">
                                <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-50 inline-block min-w-[120px] text-right">
                                  <div className="flex items-center justify-end gap-2 mb-1">
                                    <span className="text-xs font-medium">{t.category_name}</span>
                                    <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                                      {ICON_MAP[t.category_icon] && React.createElement(ICON_MAP[t.category_icon], { size: 12 })}
                                    </div>
                                  </div>
                                  <div className="text-sm font-bold text-gray-800">-{t.amount.toLocaleString()}</div>
                                  {t.note && <div className="text-[10px] text-gray-400 mt-1">{t.note}</div>}
                                </div>
                              </div>
                            )}
                            {/* Dot on the line */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border-2 border-gray-200 z-10" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ledger Modal */}
      <AnimatePresence>
        {showLedgerModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-6 shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">新增账本</h2>
                <button onClick={() => setShowLedgerModal(false)} className="p-2 text-gray-400"><X size={24} /></button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-400 ml-1">账本名称</label>
                  <input 
                    id="ledger-name-input"
                    type="text" 
                    placeholder="例如：我的装修账本"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-400 ml-1">选择账本类型</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'daily', name: '日常记账', icon: Wallet },
                      { id: 'renovation', name: '装修记账', icon: Home },
                      { id: 'travel', name: '旅游记账', icon: Car },
                      { id: 'wedding', name: '婚礼记账', icon: Heart },
                      { id: 'other', name: '其他账本', icon: LayoutGrid },
                    ].map(type => (
                      <button
                        key={type.id}
                        onClick={() => {
                          const input = document.getElementById('ledger-name-input') as HTMLInputElement;
                          const name = input.value.trim() || type.name;
                          createLedger(name, type.id);
                        }}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-gray-100 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-primary group-hover:bg-white transition-colors">
                          <type.icon size={20} />
                        </div>
                        <span className="text-xs font-medium text-gray-600 group-hover:text-primary">{type.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-md rounded-t-[32px] p-6 pb-10 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">{editingTransaction ? '修改记录' : '收支登记'}</h2>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setFormType('expense')}
                    className={cn("px-6 py-1.5 rounded-lg text-sm font-medium transition-all", formType === 'expense' ? "bg-white shadow-sm" : "text-gray-500")}
                  >支出</button>
                  <button 
                    onClick={() => setFormType('income')}
                    className={cn("px-6 py-1.5 rounded-lg text-sm font-medium transition-all", formType === 'income' ? "bg-white shadow-sm" : "text-gray-500")}
                  >收入</button>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400"><X size={24} /></button>
              </div>

              <div className="flex items-baseline gap-1 border-b-2 border-primary/20 pb-2">
                <span className="text-2xl font-bold text-primary">¥</span>
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-4xl font-bold w-full outline-none placeholder:text-gray-200"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-4 gap-4">
                {categories.filter(c => c.type === formType).map(c => (
                  <button 
                    key={c.id}
                    onClick={() => setSelectedCategory(c)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-2 rounded-2xl transition-all active:scale-95",
                      selectedCategory?.id === c.id ? "bg-primary/10 text-primary scale-105" : "text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center pointer-events-none",
                      selectedCategory?.id === c.id ? "bg-primary text-white" : "bg-gray-50"
                    )}>
                      {ICON_MAP[c.icon] && React.createElement(ICON_MAP[c.icon], { size: 24 })}
                    </div>
                    <span className="text-xs pointer-events-none">{c.name}</span>
                  </button>
                ))}
                {isAddingCategory ? (
                  <div className="col-span-2 flex flex-col gap-2 p-2 bg-gray-50 rounded-2xl">
                    <input
                      type="text"
                      autoFocus
                      placeholder="分类名称 (8字内)"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value.substring(0, 8))}
                      className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const name = newCategoryName.trim();
                          if (name) {
                            const res = await fetch('/api/categories', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name, type: formType, icon: 'Utensils' })
                            });
                            const newCat = await res.json();
                            setCategories([...categories, newCat]);
                            setSelectedCategory(newCat);
                            setIsAddingCategory(false);
                            setNewCategoryName('');
                          }
                        } else if (e.key === 'Escape') {
                          setIsAddingCategory(false);
                          setNewCategoryName('');
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          const name = newCategoryName.trim();
                          if (name) {
                            const res = await fetch('/api/categories', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name, type: formType, icon: 'Utensils' })
                            });
                            const newCat = await res.json();
                            setCategories([...categories, newCat]);
                            setSelectedCategory(newCat);
                            setIsAddingCategory(false);
                            setNewCategoryName('');
                          }
                        }}
                        className="flex-1 bg-primary text-white text-[10px] py-1.5 rounded-lg font-medium"
                      >确定</button>
                      <button 
                        onClick={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName('');
                        }}
                        className="flex-1 bg-gray-200 text-gray-600 text-[10px] py-1.5 rounded-lg font-medium"
                      >取消</button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsAddingCategory(true)}
                    className="flex flex-col items-center gap-2 p-2 rounded-2xl text-gray-400 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center pointer-events-none">
                      <Plus size={20} />
                    </div>
                    <span className="text-xs pointer-events-none">添加分类</span>
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                  <CalendarIcon size={18} className="text-gray-400" />
                  <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent text-sm outline-none flex-1"
                  />
                </div>
                <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                  <PlusCircle size={18} className="text-gray-400" />
                  <input 
                    type="text" 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="添加备注..."
                    className="bg-transparent text-sm outline-none flex-1"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button 
                  onClick={() => handleAddTransaction({
                    amount: parseFloat(amount),
                    category_id: selectedCategory?.id,
                    type: formType,
                    note,
                    date
                  })}
                  disabled={!amount}
                  className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 disabled:opacity-50 disabled:shadow-none"
                >
                  {editingTransaction ? '确认修改' : '保存记录'}
                </button>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="w-full text-gray-400 py-2 rounded-2xl font-medium text-sm transition-all active:scale-[0.98] hover:text-gray-600"
                >
                  返回
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
