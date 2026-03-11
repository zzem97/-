import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || 'vault.db';
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS ledgers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'expense' or 'income'
    icon TEXT,
    ledger_id INTEGER,
    FOREIGN KEY (ledger_id) REFERENCES ledgers(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger_id INTEGER NOT NULL,
    category_id INTEGER,
    amount REAL NOT NULL,
    type TEXT NOT NULL, -- 'expense' or 'income'
    note TEXT,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ledger_id) REFERENCES ledgers(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );
`);

// Migration: Make category_id nullable in transactions table
const tableInfo = db.prepare("PRAGMA table_info(transactions)").all() as any[];
const categoryIdCol = tableInfo.find(col => col.name === 'category_id');
if (categoryIdCol && categoryIdCol.notnull === 1) {
  console.log('Migrating transactions table to make category_id nullable...');
  db.transaction(() => {
    db.exec("ALTER TABLE transactions RENAME TO transactions_old;");
    db.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ledger_id INTEGER NOT NULL,
        category_id INTEGER,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ledger_id) REFERENCES ledgers(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );
    `);
    db.exec(`
      INSERT INTO transactions (id, ledger_id, category_id, amount, type, note, date, created_at)
      SELECT id, ledger_id, category_id, amount, type, note, date, created_at FROM transactions_old;
    `);
    db.exec("DROP TABLE transactions_old;");
  })();
}

// One-time update for existing users
db.prepare("UPDATE ledgers SET name = '小金库' WHERE name = '日常账本'").run();

// Ensure default ledgers exist
const ensureLedger = (name: string, icon: string, type?: string) => {
  const ledger = db.prepare('SELECT id FROM ledgers WHERE name = ?').get(name) as { id: number } | undefined;
  if (!ledger) {
    db.prepare('INSERT INTO ledgers (name, icon) VALUES (?, ?)').run(name, icon);
  }
};

ensureLedger('小金库', 'Wallet');
ensureLedger('装修记账', 'Home');
ensureLedger('旅游记账', 'Car');
ensureLedger('日常记账', 'LayoutGrid');

// Fix categories for existing ledgers
const fixLedgerCategories = (ledgerName: string, categories: { name: string, type: 'expense' | 'income', icon: string }[]) => {
  const ledger = db.prepare('SELECT id FROM ledgers WHERE name = ?').get(ledgerName) as { id: number } | undefined;
  if (ledger) {
    const existingCats = db.prepare('SELECT name FROM categories WHERE ledger_id = ?').all(ledger.id) as { name: string }[];
    const existingNames = new Set(existingCats.map(c => c.name));
    const insertStmt = db.prepare('INSERT INTO categories (name, type, icon, ledger_id) VALUES (?, ?, ?, ?)');
    categories.forEach(cat => {
      if (!existingNames.has(cat.name)) {
        insertStmt.run(cat.name, cat.type, cat.icon, ledger.id);
      }
    });
  }
};

fixLedgerCategories('小金库', [
  { name: '部门收入', type: 'income', icon: 'Banknote' },
  { name: '奖励', type: 'income', icon: 'TrendingUp' },
  { name: '理财', type: 'income', icon: 'TrendingUp' },
  { name: '自定义', type: 'income', icon: 'LayoutGrid' },
  { name: '营销', type: 'expense', icon: 'ShoppingBag' },
  { name: '下午茶', type: 'expense', icon: 'Utensils' },
  { name: '团建', type: 'expense', icon: 'Gamepad2' },
  { name: '自定义', type: 'expense', icon: 'LayoutGrid' },
]);

fixLedgerCategories('装修记账', [
  { name: '人工费', type: 'expense', icon: 'User' },
  { name: '材料费', type: 'expense', icon: 'ShoppingBag' },
  { name: '设计费', type: 'expense', icon: 'LayoutGrid' },
  { name: '其他支出', type: 'expense', icon: 'TrendingUp' },
  { name: '装修贷款', type: 'income', icon: 'Banknote' }
]);

fixLedgerCategories('旅游记账', [
  { name: '美食', type: 'expense', icon: 'Utensils' },
  { name: '住宿', type: 'expense', icon: 'Home' },
  { name: '交通', type: 'expense', icon: 'Car' },
  { name: '门票', type: 'expense', icon: 'Gamepad2' },
  { name: '购物', type: 'expense', icon: 'ShoppingBag' },
  { name: '其他支出', type: 'expense', icon: 'TrendingUp' }
]);

fixLedgerCategories('日常记账', [
  { name: '餐饮', type: 'expense', icon: 'Utensils' },
  { name: '购物', type: 'expense', icon: 'ShoppingBag' },
  { name: '交通', type: 'expense', icon: 'Car' },
  { name: '娱乐', type: 'expense', icon: 'Gamepad2' },
  { name: '居家', type: 'expense', icon: 'Home' },
  { name: '医疗', type: 'expense', icon: 'Heart' },
  { name: '其他支出', type: 'expense', icon: 'TrendingUp' },
  { name: '工资', type: 'income', icon: 'Banknote' },
  { name: '理财', type: 'income', icon: 'TrendingUp' }
]);

// startServer function follows

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/ledgers', (req, res) => {
    const ledgers = db.prepare("SELECT * FROM ledgers ORDER BY CASE WHEN name = '小金库' THEN 0 ELSE 1 END, id ASC").all();
    res.json(ledgers);
  });

  app.post('/api/ledgers', (req, res) => {
    const { name, icon, type } = req.body;
    const result = db.prepare('INSERT INTO ledgers (name, icon) VALUES (?, ?)').run(name, icon || 'LayoutGrid');
    const ledgerId = result.lastInsertRowid;

    // Auto-populate categories based on type
    const defaultCategories: { name: string, type: 'expense' | 'income', icon: string }[] = [];
    
    if (type === 'renovation') {
      defaultCategories.push(
        { name: '人工费', type: 'expense', icon: 'User' },
        { name: '材料费', type: 'expense', icon: 'ShoppingBag' },
        { name: '设计费', type: 'expense', icon: 'LayoutGrid' },
        { name: '其他支出', type: 'expense', icon: 'TrendingUp' },
        { name: '装修贷款', type: 'income', icon: 'Banknote' }
      );
    } else if (type === 'travel') {
      defaultCategories.push(
        { name: '美食', type: 'expense', icon: 'Utensils' },
        { name: '住宿', type: 'expense', icon: 'Home' },
        { name: '交通', type: 'expense', icon: 'Car' },
        { name: '门票', type: 'expense', icon: 'Gamepad2' },
        { name: '购物', type: 'expense', icon: 'ShoppingBag' },
        { name: '其他支出', type: 'expense', icon: 'TrendingUp' }
      );
    } else if (type === 'wedding') {
      defaultCategories.push(
        { name: '婚宴', type: 'expense', icon: 'Utensils' },
        { name: '婚庆服务', type: 'expense', icon: 'Heart' },
        { name: '婚纱礼服', type: 'expense', icon: 'User' },
        { name: '珠宝首饰', type: 'expense', icon: 'LayoutGrid' },
        { name: '伴手礼', type: 'expense', icon: 'ShoppingBag' },
        { name: '其他支出', type: 'expense', icon: 'TrendingUp' },
        { name: '礼金', type: 'income', icon: 'Banknote' },
        { name: '父母赞助', type: 'income', icon: 'TrendingUp' }
      );
    } else if (type === 'daily') {
      defaultCategories.push(
        { name: '餐饮', type: 'expense', icon: 'Utensils' },
        { name: '购物', type: 'expense', icon: 'ShoppingBag' },
        { name: '交通', type: 'expense', icon: 'Car' },
        { name: '娱乐', type: 'expense', icon: 'Gamepad2' },
        { name: '居家', type: 'expense', icon: 'Home' },
        { name: '医疗', type: 'expense', icon: 'Heart' },
        { name: '其他支出', type: 'expense', icon: 'TrendingUp' },
        { name: '工资', type: 'income', icon: 'Banknote' },
        { name: '理财', type: 'income', icon: 'TrendingUp' }
      );
    }

    const stmt = db.prepare('INSERT INTO categories (name, type, icon, ledger_id) VALUES (?, ?, ?, ?)');
    for (const cat of defaultCategories) {
      stmt.run(cat.name, cat.type, cat.icon, ledgerId);
    }

    res.json({ id: ledgerId });
  });

  app.get('/api/categories', (req, res) => {
    const { ledger_id } = req.query;
    let categories;
    if (ledger_id) {
      categories = db.prepare('SELECT * FROM categories WHERE ledger_id IS NULL OR ledger_id = ?').all(ledger_id);
    } else {
      categories = db.prepare('SELECT * FROM categories WHERE ledger_id IS NULL').all();
    }
    res.json(categories);
  });

  app.post('/api/categories', (req, res) => {
    const { name, type, icon } = req.body;
    const result = db.prepare('INSERT INTO categories (name, type, icon) VALUES (?, ?, ?)').run(name, type, icon || 'LayoutGrid');
    res.json({ id: result.lastInsertRowid, name, type, icon: icon || 'LayoutGrid' });
  });

  app.get('/api/transactions', (req, res) => {
    const { ledger_id, start_date, end_date } = req.query;
    let query = `
      SELECT t.*, 
             COALESCE(c.name, CASE WHEN t.note IS NOT NULL AND t.note != '' THEN t.note ELSE (CASE WHEN t.type = 'income' THEN '常规收入' ELSE '常规支出' END) END) as category_name,
             COALESCE(c.icon, 'LayoutGrid') as category_icon 
      FROM transactions t 
      LEFT JOIN categories c ON t.category_id = c.id 
      WHERE t.ledger_id = ?
    `;
    const params: any[] = [ledger_id];

    if (start_date && end_date) {
      query += ' AND t.date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    query += ' ORDER BY t.date DESC, t.created_at DESC';
    const transactions = db.prepare(query).all(...params);
    res.json(transactions);
  });

  app.post('/api/transactions', (req, res) => {
    const { ledger_id, category_id, amount, type, note, date } = req.body;
    const result = db.prepare(`
      INSERT INTO transactions (ledger_id, category_id, amount, type, note, date) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ledger_id, category_id ?? null, amount, type, note, date);
    res.json({ id: result.lastInsertRowid });
  });

  app.put('/api/transactions/:id', (req, res) => {
    const { category_id, amount, type, note, date } = req.body;
    db.prepare(`
      UPDATE transactions 
      SET category_id = ?, amount = ?, type = ?, note = ?, date = ?
      WHERE id = ?
    `).run(category_id ?? null, amount, type, note, date, req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/transactions/:id', (req, res) => {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/export', async (req, res) => {
    const { ledger_id } = req.query;
    const ledger = db.prepare('SELECT name FROM ledgers WHERE id = ?').get(ledger_id) as { name: string };
    const transactions = db.prepare(`
      SELECT t.date, 
             COALESCE(c.name, CASE WHEN t.note IS NOT NULL AND t.note != '' THEN t.note ELSE (CASE WHEN t.type = 'income' THEN '常规收入' ELSE '常规支出' END) END) as category,
             t.type, t.amount, t.note 
      FROM transactions t 
      LEFT JOIN categories c ON t.category_id = c.id 
      WHERE t.ledger_id = ?
      ORDER BY t.date DESC
    `).all(ledger_id) as any[];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('账单明细');

    // Define columns with Chinese headers
    worksheet.columns = [
      { header: '日期', key: 'date', width: 15 },
      { header: '分类', key: 'category', width: 15 },
      { header: '类型', key: 'type', width: 10 },
      { header: '金额', key: 'amount', width: 12 },
      { header: '备注', key: 'note', width: 25 },
    ];

    // Add rows and format data
    transactions.forEach(t => {
      worksheet.addRow({
        date: t.date,
        category: t.category,
        type: t.type === 'income' ? '收入' : '支出',
        amount: t.amount,
        note: t.note || ''
      });
    });

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        // Header styling
        if (rowNumber === 1) {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    
    const filename = `账单导出_${ledger.name}.xlsx`;
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
