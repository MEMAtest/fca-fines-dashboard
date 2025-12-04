import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { listFines, getStats, getTrends, getNotifications } from './server/services/fcaFines.js';
const app = express();
app.use(cors());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir));

app.get('/api/fca-fines/list', async (req, res) => {
  try {
    const year = Number(req.query.year || '0');
    const limit = Math.min(Number(req.query.limit || '500'), 5000);
    const rows = await listFines(year, limit);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch fines' });
  }
});

app.get('/api/fca-fines/stats', async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const stats = await getStats(year === 0 ? 0 : year);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

app.get('/api/fca-fines/trends', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || '12'), 120);
    const period = (req.query.period as string) || 'month';
    const year = Number(req.query.year || '0');

    const data = await getTrends(period, year, limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Trends endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

app.get('/api/fca-fines/notifications', async (_req, res) => {
  try {
    const notifications = await getNotifications(6);
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Notifications endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`FCA fines dashboard running on http://localhost:${port}`);
});
