// Website के पहले से बने designs को Website Catalog में डालने के लिए:  npm run seed:catalog
// जो designs catalog में पहले से हैं उन्हें नहीं छूता — admin के बदलाव बचे रहते हैं.
import { importWebsiteDefaults } from '../services/catalog.js';
import { connectDB, closeDb } from '../db/index.js';

await connectDB();
const r = await importWebsiteDefaults();
console.log(`Website के पुराने designs: ${r.added} नए जुड़े, ${r.alreadyThere} पहले से थे (कुल ${r.total}) ✔`);
await closeDb();
