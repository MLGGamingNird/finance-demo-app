import express from 'express';
import cors from 'cors';
import { transactionsRouter } from './routes/transactions.js';
import { demoRouter } from './routes/demo.js';
import { categoriesRouter } from './routes/categories.js';
import { budgetsRouter } from './routes/budgets.js';
import { summaryRouter } from './routes/summary.js';
import { chatRouter } from './routes/chat.js';
import { importsRouter } from './routes/imports.js';

// The Express app without listen(), so tests can drive it with Supertest.
export const app = express();

// Render sits behind one proxy; this makes req.ip the visitor's address.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
// Imports parse their own, larger bodies, so they mount before the default parser.
app.use('/api/imports', importsRouter);
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/chat', chatRouter);
app.use('/api/demo', demoRouter);
