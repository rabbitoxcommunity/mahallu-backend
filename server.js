require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/tenants", require("./routes/tenantRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/family", require("./routes/familyRoutes"));
app.use("/api/house", require("./routes/houseRoutes"));
app.use("/api/member", require("./routes/memberRoutes"));
app.use("/api/finance/varisankhya", require("./routes/varisankhyaRoutes"));
app.use("/api/finance/income", require("./routes/incomeRoutes"));
app.use("/api/finance/hadiya", require("./routes/hadiyaRoutes"));
app.use("/api/finance/expense", require("./routes/expenseRoutes"));
app.use("/api/finance/due-expense", require("./routes/dueExpenseRoutes"));
app.use("/api/finance/reports", require("./routes/reportRoutes"));
app.use("/api/settings/income-categories", require("./routes/incomeCategoryRoutes"));
app.use("/api/settings/expense-categories", require("./routes/expenseCategoryRoutes"));
app.use("/api/settings/varisankhya-config", require("./routes/varisankhyaConfigRoutes"));
app.use("/api/admin/marriages", require("./routes/adminMarriageRoutes"));
app.use("/api/admin/marriage-noc", require("./routes/adminMarriageNocRoutes"));
app.use("/api/public/marriages", require("./routes/publicMarriageRoutes"));
app.use("/api/community/welfare", require("./routes/welfareRoutes"));
app.use("/api/community/death", require("./routes/deathRoutes"));
app.use("/api/community/communication", require("./routes/communicationRoutes"));
app.use("/api/results/settings", require("./routes/resultSettingsRoutes"));
app.use("/api/results", require("./routes/resultRoutes"));
app.use("/api/portal", require("./routes/publicPortalRoutes"));
app.use("/api/islamic-library", require("./routes/islamicLibraryRoutes"));

app.listen(process.env.PORT || 5005, () => console.log("Server running on port 5005"));