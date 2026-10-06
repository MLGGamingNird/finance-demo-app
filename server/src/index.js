import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { transactionsRouter } from './routes/transactions.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/transactions', transactionsRouter);

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
