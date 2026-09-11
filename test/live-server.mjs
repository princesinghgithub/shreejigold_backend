// end-to-end जाँच के लिए: असली MongoDB (in-memory replica set) पर सर्वर चालू कर देता है.
// चलाने के लिए:  node test/live-server.mjs [port]
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const port = process.argv[2] || '4000';
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB = 'shreejigold_e2e';
process.env.PORT = port;
process.env.LOG_REQUESTS = 'false';
process.env.JWT_SECRET = 'e2e-secret';
process.env.CRON_SECRET = 'e2e-cron';
process.env.AUTO_BACKUP = 'false';

const { createApp } = await import('../src/app.js');
const server = createApp().listen(Number(port), () => {
  console.log('E2E सर्वर चालू → http://localhost:' + port);
  console.log('MongoDB (अस्थायी): ' + mongo.getUri());
});

async function stop() {
  server.close();
  await mongo.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
