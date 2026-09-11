// टर्मिनल से demo data भरने के लिए:  npm run seed
import { seedDemoData } from '../services/seed.js';
import { connectDB, closeDb } from '../db/index.js';

await connectDB();

const result = await seedDemoData();
console.log('डेमो डेटा भर दिया गया ✔');
console.log(result.counts);
await closeDb();
