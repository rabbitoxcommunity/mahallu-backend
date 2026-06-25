const mongoose = require("mongoose");

// Old global unique indexes that were replaced by per-tenant compound indexes.
// Dropping them here so the app self-heals without manual mongosh commands.
const legacyIndexes = [
    { collection: "duebasedincomes",    index: "income_code_1" },
    { collection: "directincomes",      index: "income_code_1" },
    { collection: "expenses",           index: "voucher_no_1" },
    { collection: "hadiyacollections",  index: "collection_code_1" },
    { collection: "marriages",          index: "marriage_id_1" },
    { collection: "marriages",          index: "certificate_no_1" },
];

const dropLegacyIndexes = async () => {
    const db = mongoose.connection.db;
    for (const { collection, index } of legacyIndexes) {
        try {
            await db.collection(collection).dropIndex(index);
            console.log(`Dropped legacy index ${index} from ${collection}`);
        } catch (err) {
            // Index doesn't exist — already dropped or never created
        }
    }
};

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    await dropLegacyIndexes();
};

module.exports = connectDB;
