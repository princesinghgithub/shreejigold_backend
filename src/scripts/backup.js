// डेटा की कॉपी अभी बनाने के लिए:  npm run backup
// कॉपी डेटाबेस के अंदर ही (backups collection में) रहती है, इसलिए Vercel पर भी चलती है.
import { createSnapshot, listSnapshots } from '../services/backup.js';
import { connectDB, closeDb } from '../db/index.js';

await connectDB();

const s = await createSnapshot('manual');
console.log('कॉपी बन गई ✔  ' + s.id);
console.log(s.counts);
if (s.pruned) console.log('पुरानी हटाई गईं: ' + s.pruned);
console.log('अभी कुल कॉपियाँ: ' + (await listSnapshots()).length);
await closeDb();
