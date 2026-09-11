// अपने कंप्यूटर पर चलाने के लिए (npm run dev / npm start).
// Vercel पर यह फाइल नहीं चलती — वहाँ api/index.js से ऐप उठता है.
import { createApp } from './app.js';
import { config } from './config.js';
import { connectDB, closeDb } from './db/index.js';
import { snapshotIfNeeded } from './services/backup.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log('Shreeji Gold backend चालू है → http://localhost:' + config.port);
  console.log('MongoDB: ' + config.mongoUri.replace(/:\/\/[^@]*@/, '://***@') + (config.mongoDb ? ' / ' + config.mongoDb : ''));
  console.log('CORS allowed: ' + config.corsOrigin.join(', '));

  try {
    await connectDB();
    console.log('डेटाबेस से जुड़ गए ✔');
  } catch (e) {
    console.error('डेटाबेस से नहीं जुड़ पाए:', e.message);
    return;
  }

  if (config.autoBackup) {
    const run = () => snapshotIfNeeded()
      .then((s) => { if (s && !s.skipped) console.log('रोज़ाना backup बना'); })
      .catch((e) => console.error('[backup] नहीं बन सका:', e.message));
    run();
    setInterval(run, 6 * 60 * 60 * 1000).unref(); // हर 6 घंटे जाँच
  }
});

function shutdown(signal) {
  console.log('\n' + signal + ' मिला — सर्वर बंद कर रहे हैं...');
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
