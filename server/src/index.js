import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { transactionsRouter } from './routes/transactions.js';
import { demoRouter } from './routes/demo.js';
import { categoriesRouter } from './routes/categories.js';
import { budgetsRouter } from './routes/budgets.js';
import { summaryRouter } from './routes/summary.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/demo', demoRouter);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
