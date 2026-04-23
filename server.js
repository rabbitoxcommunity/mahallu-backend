require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const path = require("path");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use("/api/finance/reports", require("./routes/reportRoutes"));
app.use("/api/settings/income-categories", require("./routes/incomeCategoryRoutes"));
app.use("/api/settings/expense-categories", require("./routes/expenseCategoryRoutes"));

app.listen(5005, () => console.log("Server running on port 5005"));